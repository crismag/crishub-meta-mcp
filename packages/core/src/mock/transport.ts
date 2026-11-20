import { ErrorCode, MetaToolError } from '../errors.js';
import type { FetchLike } from '../graph/client.js';
import { SUPPORTED_GRAPH_VERSIONS } from '../graph/version.js';
import {
  MOCK_ACCESS_TOKEN,
  MOCK_AD_ACCOUNTS,
  MOCK_APP_ID,
  MOCK_BUSINESSES,
  MOCK_CAMPAIGNS,
  MOCK_LEAD_FORMS,
  MOCK_PAGES,
  MOCK_SCOPES,
  mockPageToken,
} from './fixtures.js';

export const MOCK_SCENARIOS = [
  'default',
  'expired_token',
  'rate_limited',
  'permission_denied',
  'review_required',
  'upstream_flaky',
  'malformed_response',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function parseMockScenario(raw: string | undefined): MockScenario {
  if (!raw) return 'default';
  if ((MOCK_SCENARIOS as readonly string[]).includes(raw)) return raw as MockScenario;
  throw new MetaToolError(
    ErrorCode.INVALID_INPUT,
    `Unknown META_MOCK_SCENARIO. Use one of: ${MOCK_SCENARIOS.join(', ')}`,
  );
}

export interface MockCall {
  path: string;
  params: Record<string, string>;
  authorized: 'user' | 'page' | 'none';
}

interface MockResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function respond({ status, body, headers = {} }: MockResponse): Awaited<ReturnType<FetchLike>> {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const h = new Map(
    Object.entries({ 'content-type': 'application/json', ...headers }).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]),
  );
  return {
    status,
    headers: { get: (n) => h.get(n.toLowerCase()) ?? null },
    text: async () => text,
  };
}

const graphError = (
  status: number,
  code: number,
  message: string,
  subcode?: number,
  type = 'OAuthException',
): MockResponse => ({
  status,
  body: {
    error: {
      message,
      type,
      code,
      ...(subcode ? { error_subcode: subcode } : {}),
      fbtrace_id: 'MockTrace123',
    },
  },
});

function project<T extends object>(
  item: T,
  fields: string[] | undefined,
  always: readonly string[] = [],
): Partial<T> {
  if (!fields) return item;
  const out: Record<string, unknown> = {};
  for (const f of new Set([...fields, ...always])) {
    if (f in item) out[f] = (item as Record<string, unknown>)[f];
  }
  return out as Partial<T>;
}

function paginate<T>(
  items: readonly T[],
  params: Record<string, string>,
): { data: T[]; paging?: unknown } {
  const limit = Math.min(Number(params.limit ?? 25), 100);
  const offset = params.after
    ? Number(Buffer.from(params.after, 'base64url').toString('utf8').replace('off:', ''))
    : 0;
  const data = items.slice(offset, offset + limit);
  const end = offset + data.length;
  const cursor = (n: number) => Buffer.from(`off:${n}`).toString('base64url');
  const paging: Record<string, unknown> = {
    cursors: { before: cursor(offset), after: cursor(end) },
  };
  if (end < items.length)
    paging.next = `https://graph.facebook.com/next-page-url-is-never-followed?after=${cursor(end)}`;
  return { data, paging };
}

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function insightsRows(
  accountId: string,
  params: Record<string, string>,
): Record<string, unknown>[] {
  const fields = (params.fields ?? 'impressions,spend').split(',');
  let since: string;
  let until: string;
  if (params.time_range) {
    const tr = JSON.parse(params.time_range) as { since: string; until: string };
    since = tr.since;
    until = tr.until;
  } else {
    until = '2026-11-19';
    const days =
      {
        today: 0,
        yesterday: 0,
        last_7d: 6,
        last_14d: 13,
        last_30d: 29,
        this_month: 18,
        last_month: 30,
      }[params.date_preset ?? 'last_30d'] ?? 29;
    since = new Date(Date.parse(`${until}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  }
  const daily = params.time_increment === '1';
  const level = params.level ?? 'account';
  const entities =
    level === 'campaign'
      ? MOCK_CAMPAIGNS.map((c) => ({ campaign_id: c.id, campaign_name: c.name }))
      : [{}];
  const rows: Record<string, unknown>[] = [];
  const ranges: [string, string][] = [];
  if (daily) {
    for (
      let t = Date.parse(`${since}T00:00:00Z`);
      t <= Date.parse(`${until}T00:00:00Z`);
      t += 86400000
    ) {
      const d = new Date(t).toISOString().slice(0, 10);
      ranges.push([d, d]);
    }
  } else ranges.push([since, until]);
  for (const [ds, de] of ranges) {
    for (const e of entities) {
      const h = hash(`${accountId}|${ds}|${de}|${JSON.stringify(e)}`);
      const impressions = 1000 + (h % 9000);
      const clicks = 10 + (h % 290);
      const spend = ((h % 50000) / 100).toFixed(2);
      const full: Record<string, unknown> = {
        account_id: accountId.replace('act_', ''),
        ...e,
        impressions: String(impressions),
        reach: String(Math.floor(impressions * 0.8)),
        clicks: String(clicks),
        spend,
        cpc: (Number(spend) / clicks).toFixed(4),
        cpm: ((Number(spend) / impressions) * 1000).toFixed(4),
        ctr: ((clicks / impressions) * 100).toFixed(4),
        frequency: '1.25',
        actions: [{ action_type: 'lead', value: String(h % 20) }],
        date_start: ds,
        date_stop: de,
      };
      rows.push(project(full, fields, ['date_start', 'date_stop']));
    }
  }
  return rows;
}

export interface MockGraph {
  fetch: FetchLike;
  calls: MockCall[];
  scenario: MockScenario;
}

/**
 * Offline Graph API simulator. Validates host, version and bearer token, and
 * serves deterministic fixtures. It deliberately includes `access_token` on
 * Page objects regardless of requested fields to prove the toolkit strips it.
 */
export function createMockGraph(scenario: MockScenario = 'default'): MockGraph {
  const calls: MockCall[] = [];
  let flaky = 0;

  const route = (
    path: string,
    params: Record<string, string>,
    auth: MockCall['authorized'],
    pageAuth?: string,
  ): MockResponse => {
    if (auth === 'none') return graphError(400, 190, 'Invalid OAuth access token.', 467);
    switch (scenario) {
      case 'expired_token':
        return graphError(400, 190, 'Error validating access token: Session has expired.', 463);
      case 'rate_limited':
        return {
          ...graphError(
            400,
            80004,
            'There have been too many calls to this ad-account.',
            undefined,
            'OAuthException',
          ),
          headers: {
            'x-business-use-case-usage': JSON.stringify({
              [MOCK_BUSINESSES[0]!.id]: [
                {
                  type: 'ads_management',
                  call_count: 100,
                  total_cputime: 40,
                  total_time: 40,
                  estimated_time_to_regain_access: 5,
                },
              ],
            }),
          },
        };
      case 'permission_denied':
        if (path !== '/debug_token')
          return graphError(
            403,
            200,
            '(#200) Requires pages_read_engagement permission to manage the object',
          );
        break;
      case 'review_required':
        if (path !== '/debug_token')
          return graphError(
            403,
            10,
            '(#10) To use this endpoint your app needs Advanced Access, which requires App Review.',
          );
        break;
      case 'upstream_flaky':
        if (flaky++ % 2 === 0)
          return {
            status: 500,
            body: {
              error: {
                message: 'An unexpected error has occurred.',
                type: 'OAuthException',
                code: 2,
                is_transient: true,
              },
            },
          };
        break;
      case 'malformed_response':
        return { status: 200, body: { data: 'not-an-array', unexpected: true } };
      case 'default':
        break;
    }
    const fields = params.fields?.split(',');
    let m: RegExpExecArray | null;

    if (path === '/debug_token') {
      return {
        status: 200,
        body: {
          data: {
            app_id: MOCK_APP_ID,
            type: 'USER',
            application: 'Example Mock App',
            data_access_expires_at: 1798761600,
            expires_at: 1790000000,
            issued_at: 1780000000,
            is_valid: true,
            scopes: MOCK_SCOPES,
            granular_scopes: [
              { scope: 'pages_show_list', target_ids: MOCK_PAGES.map((p) => p.id) },
              { scope: 'business_management' },
            ],
            user_id: '900000000000999',
          },
        },
      };
    }
    if (path === '/me/permissions') {
      const perms = [
        ...MOCK_SCOPES.map((p) => ({ permission: p, status: 'granted' })),
        { permission: 'ads_management', status: 'declined' },
      ];
      return { status: 200, body: paginate(perms, params) };
    }
    if (path === '/me/businesses')
      return {
        status: 200,
        body: paginate(
          MOCK_BUSINESSES.map((b) => project(b, fields, ['id'])),
          params,
        ),
      };
    if (path === '/me/accounts') {
      return {
        status: 200,
        body: paginate(
          MOCK_PAGES.map((p) => ({
            ...project(p, fields, ['id']),
            access_token: mockPageToken(p.id),
          })),
          params,
        ),
      };
    }
    if (path === '/me/adaccounts')
      return {
        status: 200,
        body: paginate(
          MOCK_AD_ACCOUNTS.map((a) => project(a, fields, ['id'])),
          params,
        ),
      };
    if ((m = /^\/(act_\d+)$/.exec(path))) {
      const acct = MOCK_AD_ACCOUNTS.find((a) => a.id === m![1]);
      return acct
        ? { status: 200, body: project(acct, fields, ['id']) }
        : graphError(400, 100, 'Unsupported get request.', 33, 'GraphMethodException');
    }
    if ((m = /^\/(act_\d+)\/campaigns$/.exec(path))) {
      if (!MOCK_AD_ACCOUNTS.some((a) => a.id === m![1]))
        return graphError(400, 100, 'Unsupported get request.', 33);
      let list = MOCK_CAMPAIGNS;
      if (params.effective_status) {
        const wanted = JSON.parse(params.effective_status) as string[];
        list = list.filter((c) => wanted.includes(c.effective_status));
      }
      return {
        status: 200,
        body: paginate(
          list.map((c) => project(c, fields, ['id'])),
          params,
        ),
      };
    }
    if ((m = /^\/(act_\d+)\/insights$/.exec(path))) {
      if (!MOCK_AD_ACCOUNTS.some((a) => a.id === m![1]))
        return graphError(400, 100, 'Unsupported get request.', 33);
      return { status: 200, body: paginate(insightsRows(m[1]!, params), params) };
    }
    if ((m = /^\/(\d+)\/leadgen_forms$/.exec(path))) {
      if (pageAuth !== m[1])
        return graphError(
          400,
          190,
          'A Page access token is required to request this resource.',
          undefined,
        );
      return {
        status: 200,
        body: paginate(
          MOCK_LEAD_FORMS.map((f) => project(f, fields, ['id'])),
          params,
        ),
      };
    }
    if ((m = /^\/(\d+)$/.exec(path))) {
      const page = MOCK_PAGES.find((p) => p.id === m![1]);
      if (!page)
        return graphError(
          400,
          100,
          'Object does not exist, cannot be loaded due to missing permissions, or does not support this operation',
          33,
          'GraphMethodException',
        );
      if (fields?.includes('access_token'))
        return { status: 200, body: { id: page.id, access_token: mockPageToken(page.id) } };
      return { status: 200, body: project(page, fields, ['id']) };
    }
    return graphError(400, 100, 'Unknown path components', 2500);
  };

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.host !== 'graph.facebook.com') {
      throw new Error(`Mock refused non-Graph host: ${url.host}`);
    }
    const [, version, ...rest] = url.pathname.split('/');
    const path = `/${rest.join('/')}`;
    const params = Object.fromEntries(url.searchParams.entries());
    if (!(SUPPORTED_GRAPH_VERSIONS as readonly string[]).includes(version ?? '')) {
      return respond(graphError(400, 2635, 'Unsupported version'));
    }
    if (init.method !== 'GET') return respond(graphError(405, 100, 'Mock only supports GET'));
    const authHeader = init.headers.Authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    let authorized: MockCall['authorized'] = 'none';
    let pageAuth: string | undefined;
    if (bearer === MOCK_ACCESS_TOKEN || bearer === `${MOCK_APP_ID}|mock-app-secret-do-not-use`)
      authorized = 'user';
    const pageMatch = /^EAAMOCKPAGETOKEN(\d+)DONOTUSE$/.exec(bearer);
    if (pageMatch) {
      authorized = 'page';
      pageAuth = pageMatch[1];
    }
    const redactedParams = Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, /token|proof/.test(k) ? '[REDACTED]' : v]),
    );
    calls.push({ path, params: redactedParams, authorized });
    if (init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return respond(route(path, params, authorized, pageAuth));
  };

  return { fetch, calls, scenario };
}
