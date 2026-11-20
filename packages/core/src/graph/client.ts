import { createHmac } from 'node:crypto';
import type { CredentialProvider } from '../credentials.js';
import { ErrorCode, MetaToolError, isMetaToolError } from '../errors.js';
import { silentLogger, type Logger } from '../logger.js';
import { SecretToken } from '../secret.js';
import {
  FORBIDDEN_FIELDS,
  validatePathParam,
  type EndpointAllowlist,
  type EndpointRule,
} from './endpoints.js';
import { mapGraphError, type GraphErrorBody } from './error-map.js';
import type { GraphVersion } from './version.js';

/** The only host the client will ever contact. */
export const GRAPH_HOST = 'graph.facebook.com';

export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal; redirect: 'error' },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface GraphClientOptions {
  version: GraphVersion;
  credentials: CredentialProvider;
  allowlist: EndpointAllowlist;
  fetch?: FetchLike;
  logger?: Logger;
  /** Per-attempt timeout. Default 10 s. */
  timeoutMs?: number;
  /** Retries for transient failures (idempotent GETs only). Default 2. */
  maxRetries?: number;
  /** Base backoff. Default 250 ms, doubled per attempt with jitter, capped at 4 s. */
  backoffMs?: number;
  /** Max response body size. Default 2 MiB. */
  maxResponseBytes?: number;
  /** Test hook. */
  sleep?: (ms: number) => Promise<void>;
  /** Test hook for jitter (0..1). */
  random?: () => number;
}

export interface GraphRequest {
  pathParams?: Record<string, string>;
  fields?: readonly string[];
  query?: Record<string, string | undefined>;
  limit?: number;
  after?: string;
  /** Use a Page token for this Page id (resolved internally, never returned). */
  asPage?: string;
}

export interface PageResult<T> {
  items: T[];
  /** Opaque cursor for the next page, when more data exists. */
  nextCursor?: string;
  /** True when the caller's item/page budget stopped iteration before the end. */
  truncated: boolean;
}

export interface UsageSnapshot {
  appUsage?: { call_count?: number; total_cputime?: number; total_time?: number };
  maxBusinessUseCasePct?: number;
  estimatedTimeToRegainAccessMinutes?: number;
}

const CURSOR_RE = /^[A-Za-z0-9_\-=%.]{1,1024}$/;
const PAGE_TOKEN_TTL_MS = 10 * 60 * 1000;

function computeProof(token: SecretToken, appSecret: SecretToken): string {
  return createHmac('sha256', appSecret.reveal()).update(token.reveal()).digest('hex');
}

function parseJsonHeader(raw: string | null): unknown {
  if (!raw || raw.length > 8192) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function parseUsageHeaders(headers: { get(name: string): string | null }): UsageSnapshot {
  const snap: UsageSnapshot = {};
  const app = parseJsonHeader(headers.get('x-app-usage'));
  if (app && typeof app === 'object') {
    const a = app as Record<string, unknown>;
    snap.appUsage = {};
    for (const k of ['call_count', 'total_cputime', 'total_time'] as const) {
      if (typeof a[k] === 'number') snap.appUsage[k] = a[k];
    }
  }
  const buc = parseJsonHeader(headers.get('x-business-use-case-usage'));
  if (buc && typeof buc === 'object') {
    for (const entries of Object.values(buc as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries as Record<string, unknown>[]) {
        for (const k of ['call_count', 'total_cputime', 'total_time']) {
          const v = e[k];
          if (typeof v === 'number')
            snap.maxBusinessUseCasePct = Math.max(snap.maxBusinessUseCasePct ?? 0, v);
        }
        const eta = e.estimated_time_to_regain_access;
        if (typeof eta === 'number' && eta > 0) {
          snap.estimatedTimeToRegainAccessMinutes = Math.max(
            snap.estimatedTimeToRegainAccessMinutes ?? 0,
            eta,
          );
        }
      }
    }
  }
  return snap;
}

/**
 * Allowlisted, read-only Graph API client.
 *
 * Guarantees: fixed https host and API version; only registered GET rules;
 * validated path params, fields, query values and cursors; no following of
 * `paging.next` URLs (cursors are re-applied to the same rule); tokens sent in
 * the Authorization header and never logged; bounded timeouts, retries,
 * response sizes and pagination.
 */
export class GraphClient {
  readonly version: GraphVersion;
  readonly #opts: Required<Omit<GraphClientOptions, 'fetch'>> & { fetch: FetchLike };
  readonly #pageTokens = new Map<string, { token: SecretToken; expires: number }>();
  #lastUsage: UsageSnapshot = {};

  constructor(options: GraphClientOptions) {
    const f = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.version = options.version;
    this.#opts = {
      logger: silentLogger,
      timeoutMs: 10_000,
      maxRetries: 2,
      backoffMs: 250,
      maxResponseBytes: 2 * 1024 * 1024,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      random: Math.random,
      ...options,
      fetch: f,
    };
  }

  get lastUsage(): UsageSnapshot {
    return { ...this.#lastUsage };
  }

  get allowlist(): EndpointAllowlist {
    return this.#opts.allowlist;
  }

  /** Build the request URL for a rule. Exposed for tests; contains no credentials. */
  buildUrl(rule: EndpointRule, req: GraphRequest): URL {
    let path = rule.template;
    for (const [name, kind] of Object.entries(rule.pathParams)) {
      const value = validatePathParam(kind, name, req.pathParams?.[name]);
      path = path.replace(`{${name}}`, value);
    }
    const url = new URL(`https://${GRAPH_HOST}/${this.version}${path}`);
    if (
      url.host !== GRAPH_HOST ||
      url.protocol !== 'https:' ||
      url.pathname !== `/${this.version}${path}`
    ) {
      throw new MetaToolError(ErrorCode.ENDPOINT_NOT_ALLOWED, 'Refusing to build a non-Graph URL.');
    }

    const fields = req.fields && req.fields.length > 0 ? req.fields : rule.defaultFields;
    for (const f of fields) {
      if (!rule.allowedFields.includes(f) || (!rule.internal && FORBIDDEN_FIELDS.has(f))) {
        throw new MetaToolError(
          ErrorCode.INVALID_INPUT,
          `Field "${String(f).slice(0, 64)}" is not allowed for this operation.`,
        );
      }
    }
    if (fields.length > 0) url.searchParams.set('fields', [...new Set(fields)].join(','));

    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value === undefined) continue;
      const validator = rule.allowedQuery?.[key];
      if (!validator || !validator(value)) {
        throw new MetaToolError(
          ErrorCode.INVALID_INPUT,
          `Query parameter "${key.slice(0, 32)}" is not allowed or invalid.`,
        );
      }
      url.searchParams.set(key, value);
    }
    if (rule.paginated) {
      const max = rule.maxLimit ?? 100;
      const limit = req.limit ?? Math.min(25, max);
      if (!Number.isInteger(limit) || limit < 1 || limit > max) {
        throw new MetaToolError(
          ErrorCode.INVALID_INPUT,
          `limit must be an integer between 1 and ${max}.`,
        );
      }
      url.searchParams.set('limit', String(limit));
      if (req.after !== undefined) {
        if (!CURSOR_RE.test(req.after))
          throw new MetaToolError(ErrorCode.INVALID_INPUT, 'Invalid pagination cursor.');
        url.searchParams.set('after', req.after);
      }
    } else if (req.limit !== undefined || req.after !== undefined) {
      throw new MetaToolError(ErrorCode.INVALID_INPUT, 'This operation is not paginated.');
    }
    return url;
  }

  /** Perform an allowlisted GET and return the schema-validated body. */
  async get<R>(ruleId: string, req: GraphRequest = {}): Promise<R> {
    const rule = this.#opts.allowlist.require(ruleId) as EndpointRule<R>;
    if (rule.internal) {
      throw new MetaToolError(
        ErrorCode.ENDPOINT_NOT_ALLOWED,
        'Internal operations cannot be called directly.',
      );
    }
    return this.#execute(rule, req);
  }

  /**
   * Iterate a paginated rule with an item and page budget. Cursors from
   * `paging.cursors.after` are re-applied to the same rule; `paging.next` URLs
   * are never fetched.
   */
  async list<T>(
    ruleId: string,
    req: GraphRequest = {},
    budget: { maxItems: number; maxPages?: number },
  ): Promise<PageResult<T>> {
    const rule = this.#opts.allowlist.require(ruleId);
    if (!rule.paginated || rule.internal)
      throw new MetaToolError(ErrorCode.ENDPOINT_NOT_ALLOWED, 'Not a listable operation.');
    const maxPages = Math.min(budget.maxPages ?? 5, 20);
    const items: T[] = [];
    let after = req.after;
    for (let page = 0; page < maxPages; page++) {
      const remaining = budget.maxItems - items.length;
      const limit = Math.min(req.limit ?? rule.maxLimit ?? 100, rule.maxLimit ?? 100, remaining);
      const body = (await this.#execute(rule, {
        ...req,
        limit,
        ...(after !== undefined ? { after } : {}),
      })) as {
        data: T[];
        paging?: { next?: string; cursors?: { after?: string } };
      };
      items.push(...body.data.slice(0, remaining));
      const nextAfter = body.paging?.next ? body.paging.cursors?.after : undefined;
      if (!nextAfter) return { items, truncated: false };
      if (items.length >= budget.maxItems || page === maxPages - 1) {
        return { items, truncated: true, nextCursor: nextAfter };
      }
      if (nextAfter === after) {
        throw new MetaToolError(
          ErrorCode.UPSTREAM_UNAVAILABLE,
          'Pagination cursor did not advance.',
          { retryable: false },
        );
      }
      after = nextAfter;
    }
    return { items, truncated: true };
  }

  /** Resolve (and cache) a Page access token. The token never leaves this class. */
  async #pageToken(pageId: string): Promise<SecretToken> {
    const id = validatePathParam('numeric_id', 'page_id', pageId);
    const cached = this.#pageTokens.get(id);
    if (cached && cached.expires > Date.now()) return cached.token;
    const rule = this.#opts.allowlist.require('core.internal.page_access_token');
    const body = (await this.#execute(rule, {
      pathParams: { page_id: id },
      fields: ['access_token'],
    })) as {
      access_token?: string;
    };
    if (!body.access_token) {
      throw new MetaToolError(
        ErrorCode.PERMISSION_DENIED,
        'No Page access token is available for this Page.',
      );
    }
    const token = new SecretToken(body.access_token);
    this.#pageTokens.set(id, { token, expires: Date.now() + PAGE_TOKEN_TTL_MS });
    return token;
  }

  async #tokenFor(rule: EndpointRule, req: GraphRequest): Promise<SecretToken> {
    const creds = this.#opts.credentials;
    if (rule.tokenType === 'page') {
      if (!req.asPage)
        throw new MetaToolError(
          ErrorCode.INTERNAL_ERROR,
          'Page token required but no Page specified.',
        );
      return this.#pageToken(req.asPage);
    }
    if (rule.tokenType === 'app') {
      const appId = creds.getAppId();
      const secret = await creds.getAppSecret();
      if (appId && secret) return new SecretToken(`${appId}|${secret.reveal()}`);
      // Per the debug_token reference, a developer's user token of the same app is also accepted.
    }
    return creds.getAccessToken();
  }

  async #execute<R>(rule: EndpointRule<R>, req: GraphRequest): Promise<R> {
    const url = this.buildUrl(rule, req);
    const token = await this.#tokenFor(rule, req);
    const appSecret = await this.#opts.credentials.getAppSecret();
    if (appSecret && rule.tokenType !== 'app')
      url.searchParams.set('appsecret_proof', computeProof(token, appSecret));
    if (rule.id === 'core.debug_token') {
      // debug_token inspects the primary token; it is placed in the query only here, never logged.
      url.searchParams.set('input_token', (await this.#opts.credentials.getAccessToken()).reveal());
    }

    const { logger, maxRetries } = this.#opts;
    let attempt = 0;
    for (;;) {
      const started = Date.now();
      try {
        const result = await this.#attempt(rule, url, token);
        logger.debug('graph request ok', { rule: rule.id, attempt, ms: Date.now() - started });
        return result;
      } catch (err) {
        const retryable =
          isMetaToolError(err) && err.code === ErrorCode.UPSTREAM_UNAVAILABLE && err.retryable;
        logger.warn('graph request failed', {
          rule: rule.id,
          attempt,
          ms: Date.now() - started,
          code: isMetaToolError(err) ? err.code : 'UNKNOWN',
          upstreamCode: isMetaToolError(err) ? err.upstream?.code : undefined,
        });
        if (!retryable || attempt >= maxRetries) throw err;
        const delay =
          Math.min(4000, this.#opts.backoffMs * 2 ** attempt) * (0.5 + this.#opts.random() / 2);
        await this.#opts.sleep(delay);
        attempt++;
      }
    }
  }

  async #attempt<R>(rule: EndpointRule<R>, url: URL, token: SecretToken): Promise<R> {
    const signal = AbortSignal.timeout(this.#opts.timeoutMs);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.#opts.fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token.reveal()}`, Accept: 'application/json' },
        signal,
        redirect: 'error',
      });
    } catch (cause) {
      const timeout =
        cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
      throw new MetaToolError(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        timeout ? 'Meta API request timed out.' : 'Network error contacting Meta API.',
        { retryable: true },
      );
    }

    this.#lastUsage = parseUsageHeaders(res.headers);
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > this.#opts.maxResponseBytes) {
      throw new MetaToolError(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Meta API response exceeded size limit.',
        { retryable: false },
      );
    }
    const text = await res.text();
    if (Buffer.byteLength(text) > this.#opts.maxResponseBytes) {
      throw new MetaToolError(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Meta API response exceeded size limit.',
        { retryable: false },
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new MetaToolError(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Meta API returned a non-JSON response.',
        {
          retryable: res.status >= 500,
          upstream: { httpStatus: res.status },
        },
      );
    }
    const errorBody =
      body && typeof body === 'object' && 'error' in body
        ? ((body as { error: GraphErrorBody }).error ?? {})
        : undefined;
    if (errorBody || res.status >= 400) {
      const retryAfter =
        this.#lastUsage.estimatedTimeToRegainAccessMinutes !== undefined
          ? this.#lastUsage.estimatedTimeToRegainAccessMinutes * 60
          : undefined;
      throw mapGraphError(res.status, errorBody, retryAfter);
    }
    const parsed = rule.responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new MetaToolError(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        'Meta API response did not match the expected schema.',
        {
          retryable: false,
        },
      );
    }
    return parsed.data;
  }
}
