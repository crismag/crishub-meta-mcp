import type { z } from 'zod';
import { ErrorCode, MetaToolError } from '../errors.js';

/** Kinds of path parameter. Every kind has a strict validator; nothing else reaches the URL. */
export type PathParamKind = 'numeric_id' | 'ad_account_id' | 'self';

const VALIDATORS: Record<PathParamKind, (v: string) => string | undefined> = {
  numeric_id: (v) => (/^\d{1,20}$/.test(v) ? v : undefined),
  ad_account_id: (v) => {
    const m = /^(?:act_)?(\d{1,20})$/.exec(v);
    return m ? `act_${m[1]}` : undefined;
  },
  self: (v) => (v === 'me' ? 'me' : undefined),
};

export function validatePathParam(kind: PathParamKind, name: string, value: unknown): string {
  // 'self' params always resolve to the token owner; they cannot target another user.
  if (kind === 'self' && value === undefined) return 'me';
  const out = typeof value === 'string' ? VALIDATORS[kind](value) : undefined;
  if (out === undefined) {
    throw new MetaToolError(
      ErrorCode.INVALID_INPUT,
      `Invalid ${name}: expected ${kind.replace('_', ' ')}`,
    );
  }
  return out;
}

export type QueryValidator = (value: string) => boolean;

/**
 * One allowlisted Graph operation. The Graph client refuses anything not
 * described by a registered rule: there is no generic passthrough.
 */
export interface EndpointRule<R = unknown> {
  /** Stable id, e.g. "facebook.pages.list". */
  id: string;
  method: 'GET';
  /** Path template with {param} placeholders, e.g. "/{page_id}/leadgen_forms". */
  template: string;
  pathParams: Record<string, PathParamKind>;
  /** Fields that may be requested via `fields=`. */
  allowedFields: readonly string[];
  /** Fields used when the caller requests none. */
  defaultFields: readonly string[];
  /** Additional query parameters and their validators. */
  allowedQuery?: Record<string, QueryValidator>;
  /** Whether this edge returns a paginated `data[]` collection. */
  paginated: boolean;
  /** Upper bound for the `limit` parameter. */
  maxLimit?: number;
  /** Token the request must be made with. */
  tokenType: 'primary' | 'page' | 'app';
  /** Internal rules may request sensitive fields (e.g. Page tokens) and are never exposed to tools. */
  internal?: boolean;
  /** Schema the raw response must satisfy. Unknown keys are stripped. */
  responseSchema: z.ZodType<R>;
}

/** Fields that may never be requested by non-internal rules. */
export const FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
  'access_token',
  'page_token',
  'appsecret_proof',
  'client_secret',
  'secret',
]);

export class EndpointAllowlist {
  readonly #rules = new Map<string, EndpointRule>();

  register(rule: EndpointRule): void {
    if (this.#rules.has(rule.id)) throw new Error(`Duplicate endpoint rule: ${rule.id}`);
    if (rule.method !== 'GET') throw new Error(`Only GET rules are allowed in phase 1: ${rule.id}`);
    if (
      !rule.template.startsWith('/') ||
      rule.template.includes('..') ||
      /[?#]/.test(rule.template)
    ) {
      throw new Error(`Invalid template for ${rule.id}`);
    }
    for (const placeholder of rule.template.match(/\{(\w+)\}/g) ?? []) {
      const name = placeholder.slice(1, -1);
      if (!(name in rule.pathParams)) throw new Error(`Unbound placeholder ${name} in ${rule.id}`);
    }
    if (!rule.internal) {
      for (const f of rule.allowedFields) {
        if (FORBIDDEN_FIELDS.has(f)) throw new Error(`Rule ${rule.id} may not allow field ${f}`);
      }
    }
    for (const f of rule.defaultFields) {
      if (!rule.allowedFields.includes(f))
        throw new Error(`Default field ${f} not allowed in ${rule.id}`);
    }
    this.#rules.set(rule.id, Object.freeze({ ...rule }) as EndpointRule);
  }

  get(id: string): EndpointRule | undefined {
    return this.#rules.get(id);
  }

  require(id: string): EndpointRule {
    const rule = this.#rules.get(id);
    if (!rule) {
      throw new MetaToolError(
        ErrorCode.ENDPOINT_NOT_ALLOWED,
        `Operation "${id.slice(0, 64)}" is not allowlisted.`,
      );
    }
    return rule;
  }

  list(): EndpointRule[] {
    return [...this.#rules.values()];
  }
}

export const isDate = (v: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const oneOf =
  (...values: string[]): QueryValidator =>
  (v) =>
    values.includes(v);
