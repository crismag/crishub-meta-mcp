import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  EndpointAllowlist,
  ErrorCode,
  GraphClient,
  StaticCredentialProvider,
  createDiagnosticsAdapter,
  type EndpointRule,
  type FetchLike,
} from '@crishub-meta-mcp/core';

const TOKEN = 'EAABTESTTOKEN1234567890abcdef';

const listRule: EndpointRule = {
  id: 'test.list',
  method: 'GET',
  template: '/{user}/things',
  pathParams: { user: 'self' },
  allowedFields: ['id', 'name'],
  defaultFields: ['id'],
  allowedQuery: { kind: (v) => v === 'a' || v === 'b' },
  paginated: true,
  maxLimit: 10,
  tokenType: 'primary',
  responseSchema: z.object({
    data: z.array(z.object({ id: z.string(), name: z.string().optional() })),
    paging: z
      .object({
        next: z.string().optional(),
        cursors: z.object({ after: z.string().optional() }).optional(),
      })
      .optional(),
  }),
};
const getRule: EndpointRule = {
  id: 'test.get',
  method: 'GET',
  template: '/{page_id}',
  pathParams: { page_id: 'numeric_id' },
  allowedFields: ['id', 'name'],
  defaultFields: ['id', 'name'],
  paginated: false,
  tokenType: 'primary',
  responseSchema: z.object({ id: z.string(), name: z.string() }),
};

type Reply = { status: number; body: unknown; headers?: Record<string, string> };
function fakeFetch(replies: Reply[] | ((url: URL) => Reply)) {
  const seen: { url: URL; headers: Record<string, string>; redirect: string }[] = [];
  const fn: FetchLike = async (input, init) => {
    const url = new URL(input);
    seen.push({ url, headers: init.headers, redirect: init.redirect });
    const r =
      typeof replies === 'function' ? replies(url) : (replies.shift() ?? { status: 500, body: {} });
    const text = JSON.stringify(r.body);
    return {
      status: r.status,
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
      text: async () => text,
    };
  };
  return { fn, seen };
}

function client(
  fetch: FetchLike,
  opts: {
    appSecret?: string;
    maxRetries?: number;
    maxResponseBytes?: number;
    timeoutMs?: number;
  } = {},
) {
  const allowlist = new EndpointAllowlist();
  [listRule, getRule, ...createDiagnosticsAdapter().endpoints].forEach((r) =>
    allowlist.register(r),
  );
  const sleep = vi.fn(async () => {});
  const c = new GraphClient({
    version: 'v26.0',
    credentials: new StaticCredentialProvider({
      accessToken: TOKEN,
      appId: '123456',
      ...(opts.appSecret ? { appSecret: opts.appSecret } : {}),
    }),
    allowlist,
    fetch,
    sleep,
    random: () => 0.5,
    ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
    ...(opts.maxResponseBytes !== undefined ? { maxResponseBytes: opts.maxResponseBytes } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return { c, sleep };
}

describe('GraphClient request construction', () => {
  it('uses the fixed host and version, header auth and no token in the URL', async () => {
    const { fn, seen } = fakeFetch([{ status: 200, body: { id: '1', name: 'x' } }]);
    await client(fn).c.get('test.get', { pathParams: { page_id: '42' } });
    const { url, headers, redirect } = seen[0]!;
    expect(url.origin).toBe('https://graph.facebook.com');
    expect(url.pathname).toBe('/v26.0/42');
    expect(url.searchParams.get('fields')).toBe('id,name');
    expect(url.toString()).not.toContain(TOKEN);
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(redirect).toBe('error');
  });

  it('adds appsecret_proof as HMAC-SHA256(token, secret) when an app secret is configured', async () => {
    const { fn, seen } = fakeFetch([{ status: 200, body: { id: '1', name: 'x' } }]);
    await client(fn, { appSecret: 'shhh-app-secret' }).c.get('test.get', {
      pathParams: { page_id: '42' },
    });
    const expected = createHmac('sha256', 'shhh-app-secret').update(TOKEN).digest('hex');
    expect(seen[0]!.url.searchParams.get('appsecret_proof')).toBe(expected);
  });

  it.each([
    ['unknown operation', 'graph.raw', {}, ErrorCode.ENDPOINT_NOT_ALLOWED],
    [
      'internal operation',
      'core.internal.page_access_token',
      { pathParams: { page_id: '1' } },
      ErrorCode.ENDPOINT_NOT_ALLOWED,
    ],
    ['path injection', 'test.get', { pathParams: { page_id: '1/feed' } }, ErrorCode.INVALID_INPUT],
    [
      'host injection',
      'test.get',
      { pathParams: { page_id: '@evil.example.com' } },
      ErrorCode.INVALID_INPUT,
    ],
    [
      'non-allowlisted field',
      'test.get',
      { pathParams: { page_id: '1' }, fields: ['email'] },
      ErrorCode.INVALID_INPUT,
    ],
    [
      'token field',
      'test.get',
      { pathParams: { page_id: '1' }, fields: ['access_token'] },
      ErrorCode.INVALID_INPUT,
    ],
    [
      'unknown query param',
      'test.get',
      { pathParams: { page_id: '1' }, query: { redirect_uri: 'x' } },
      ErrorCode.INVALID_INPUT,
    ],
    [
      'limit on unpaginated',
      'test.get',
      { pathParams: { page_id: '1' }, limit: 5 },
      ErrorCode.INVALID_INPUT,
    ],
  ])('fails closed on %s without any network call', async (_l, rule, req, code) => {
    const { fn, seen } = fakeFetch([]);
    await expect(client(fn).c.get(rule, req)).rejects.toMatchObject({ code });
    expect(seen).toHaveLength(0);
  });

  it('validates query values and cursors', async () => {
    const { fn, seen } = fakeFetch([]);
    const { c } = client(fn);
    await expect(c.get('test.list', { query: { kind: 'z' } })).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
    await expect(c.get('test.list', { after: 'abc&access_token=x' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
    await expect(c.get('test.list', { limit: 11 })).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
    expect(seen).toHaveLength(0);
  });
});

describe('GraphClient responses', () => {
  it('maps Graph errors', async () => {
    const { fn } = fakeFetch([
      { status: 400, body: { error: { code: 190, error_subcode: 463, message: 'expired' } } },
    ]);
    await expect(
      client(fn).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toMatchObject({
      code: ErrorCode.TOKEN_EXPIRED,
    });
  });

  it('fails closed when the response does not match the schema', async () => {
    const { fn } = fakeFetch([{ status: 200, body: { id: 1 } }]);
    await expect(
      client(fn).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
    });
  });

  it('strips unexpected keys such as access_token from responses', async () => {
    const { fn } = fakeFetch([
      { status: 200, body: { id: '1', name: 'x', access_token: 'EAABLEAKED1234567890xx' } },
    ]);
    const res = await client(fn).c.get<Record<string, unknown>>('test.get', {
      pathParams: { page_id: '1' },
    });
    expect(res).toEqual({ id: '1', name: 'x' });
  });

  it('enforces a response size cap', async () => {
    const { fn } = fakeFetch([{ status: 200, body: { id: '1', name: 'x'.repeat(5000) } }]);
    await expect(
      client(fn, { maxResponseBytes: 1000 }).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
    });
  });

  it('rejects non-JSON bodies', async () => {
    const fn: FetchLike = async () => ({
      status: 502,
      headers: { get: () => null },
      text: async () => '<html>',
    });
    await expect(
      client(fn, { maxRetries: 0 }).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
    });
  });

  it('records rate-limit usage headers and sets retryAfterSeconds', async () => {
    const buc = JSON.stringify({
      '1': [
        {
          type: 'pages',
          call_count: 98,
          total_time: 10,
          total_cputime: 5,
          estimated_time_to_regain_access: 3,
        },
      ],
    });
    const { fn } = fakeFetch([
      {
        status: 400,
        body: { error: { code: 80001 } },
        headers: { 'x-business-use-case-usage': buc, 'x-app-usage': '{"call_count":12}' },
      },
    ]);
    const { c } = client(fn);
    await expect(c.get('test.get', { pathParams: { page_id: '1' } })).rejects.toMatchObject({
      code: ErrorCode.RATE_LIMITED,
      retryAfterSeconds: 180,
    });
    expect(c.lastUsage).toMatchObject({
      appUsage: { call_count: 12 },
      maxBusinessUseCasePct: 98,
      estimatedTimeToRegainAccessMinutes: 3,
    });
  });
});

describe('GraphClient body reading', () => {
  const streamOf = (chunks: Uint8Array[], failAt?: number) => {
    let i = 0;
    let cancelled = false;
    return {
      get cancelled() {
        return cancelled;
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (failAt !== undefined && i === failAt)
              throw Object.assign(new Error('reset'), { name: 'TypeError' });
            return i < chunks.length ? { done: false, value: chunks[i++] } : { done: true };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
    };
  };

  it('stops reading a chunked body as soon as it exceeds the cap', async () => {
    const chunk = new Uint8Array(400).fill(32);
    const stream = streamOf([chunk, chunk, chunk, chunk, chunk]);
    let textCalled = false;
    const fn: FetchLike = async () => ({
      status: 200,
      headers: { get: () => null }, // no content-length
      body: stream.body,
      text: async () => {
        textCalled = true;
        return '';
      },
    });
    await expect(
      client(fn, { maxResponseBytes: 1000 }).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
      retryable: false,
      message: expect.stringContaining('size limit'),
    });
    expect(stream.cancelled).toBe(true);
    expect(textCalled).toBe(false);
  });

  it('decodes a streamed body', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ id: '1', name: 'é' }));
    const fn: FetchLike = async () => ({
      status: 200,
      headers: { get: () => null },
      body: streamOf([bytes.slice(0, 5), bytes.slice(5)]).body,
      text: async () => '',
    });
    await expect(client(fn).c.get('test.get', { pathParams: { page_id: '1' } })).resolves.toEqual({
      id: '1',
      name: 'é',
    });
  });

  it('retries when the connection drops while reading the body', async () => {
    let calls = 0;
    const fn: FetchLike = async () => {
      calls++;
      if (calls === 1) {
        return {
          status: 200,
          headers: { get: () => null },
          body: streamOf([new Uint8Array([123])], 1).body,
          text: async () => '',
        };
      }
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ id: '1', name: 'x' }),
      };
    };
    await expect(client(fn).c.get('test.get', { pathParams: { page_id: '1' } })).resolves.toEqual({
      id: '1',
      name: 'x',
    });
    expect(calls).toBe(2);
  });

  it('maps a body-read timeout to a retryable upstream error, not INTERNAL_ERROR', async () => {
    let calls = 0;
    const fn: FetchLike = async () => {
      calls++;
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => {
          throw Object.assign(new Error('t'), { name: 'TimeoutError' });
        },
      };
    };
    await expect(
      client(fn, { maxRetries: 1 }).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
      retryable: true,
    });
    expect(calls).toBe(2);
  });
});

describe('GraphClient retries', () => {
  it('retries transient failures with bounded backoff', async () => {
    const { fn, seen } = fakeFetch([
      { status: 500, body: { error: { code: 2, is_transient: true } } },
      { status: 503, body: {} },
      { status: 200, body: { id: '1', name: 'x' } },
    ]);
    const { c, sleep } = client(fn);
    await expect(c.get('test.get', { pathParams: { page_id: '1' } })).resolves.toEqual({
      id: '1',
      name: 'x',
    });
    expect(seen).toHaveLength(3);
    expect(sleep.mock.calls.map((a) => (a as unknown[])[0])).toEqual([187.5, 375]);
  });

  it('gives up after maxRetries', async () => {
    const { fn, seen } = fakeFetch(() => ({ status: 500, body: { error: { code: 1 } } }));
    await expect(
      client(fn, { maxRetries: 2 }).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
    });
    expect(seen).toHaveLength(3);
  });

  it.each([
    ['rate limit', { status: 400, body: { error: { code: 4 } } }],
    ['expired token', { status: 400, body: { error: { code: 190 } } }],
    ['permission', { status: 403, body: { error: { code: 200 } } }],
  ])('does not retry %s', async (_l, reply) => {
    const { fn, seen } = fakeFetch(() => reply);
    await expect(
      client(fn).c.get('test.get', { pathParams: { page_id: '1' } }),
    ).rejects.toBeDefined();
    expect(seen).toHaveLength(1);
  });

  it('times out slow requests and retries them', async () => {
    let calls = 0;
    const fn: FetchLike = (_input, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('t'), { name: 'TimeoutError' })),
        );
      });
    };
    await expect(
      client(fn, { timeoutMs: 20, maxRetries: 1 }).c.get('test.get', {
        pathParams: { page_id: '1' },
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
      message: expect.stringContaining('timed out'),
    });
    expect(calls).toBe(2);
  });
});

describe('GraphClient pagination', () => {
  const pages = (total: number) => (url: URL) => {
    const after = Number(url.searchParams.get('after') ?? 0);
    const limit = Number(url.searchParams.get('limit'));
    const data = Array.from({ length: Math.min(limit, total - after) }, (_, i) => ({
      id: String(after + i),
    }));
    const end = after + data.length;
    return {
      status: 200,
      body: {
        data,
        paging: {
          cursors: { after: String(end) },
          ...(end < total ? { next: 'https://evil.example.com/steal' } : {}),
        },
      },
    };
  };

  it('follows cursors on the same rule and never fetches paging.next', async () => {
    const { fn, seen } = fakeFetch(pages(25));
    const res = await client(fn).c.list('test.list', {}, { maxItems: 100, maxPages: 10 });
    expect(res.items).toHaveLength(25);
    expect(res.truncated).toBe(false);
    expect(seen.every((s) => s.url.host === 'graph.facebook.com')).toBe(true);
    expect(seen).toHaveLength(3);
  });

  it('stops at the item budget and returns a cursor', async () => {
    const { fn } = fakeFetch(pages(50));
    const res = await client(fn).c.list('test.list', {}, { maxItems: 15 });
    expect(res.items).toHaveLength(15);
    expect(res.truncated).toBe(true);
    expect(res.nextCursor).toBe('15');
  });

  it('stops at the page budget', async () => {
    const { fn, seen } = fakeFetch(pages(1000));
    const res = await client(fn).c.list('test.list', {}, { maxItems: 1000, maxPages: 2 });
    expect(seen).toHaveLength(2);
    expect(res.truncated).toBe(true);
  });

  it('detects a non-advancing cursor', async () => {
    const { fn } = fakeFetch(() => ({
      status: 200,
      body: { data: [{ id: '1' }], paging: { next: 'x', cursors: { after: 'same' } } },
    }));
    await expect(
      client(fn).c.list('test.list', { after: 'same' }, { maxItems: 100 }),
    ).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_UNAVAILABLE,
    });
  });
});

describe('Page token resolution', () => {
  it('resolves Page tokens internally and uses them only as bearer credentials', async () => {
    const pageToken = 'EAABPAGETOKEN9876543210abcdef';
    const { fn, seen } = fakeFetch((url) => {
      if (url.searchParams.get('fields') === 'access_token')
        return { status: 200, body: { id: '77', access_token: pageToken } };
      return { status: 200, body: { data: [{ id: 'f1' }] } };
    });
    const allowlist = new EndpointAllowlist();
    createDiagnosticsAdapter().endpoints.forEach((r) => allowlist.register(r));
    allowlist.register({
      ...listRule,
      id: 'test.page_edge',
      template: '/{page_id}/forms',
      pathParams: { page_id: 'numeric_id' },
      tokenType: 'page',
    });
    const c = new GraphClient({
      version: 'v26.0',
      credentials: new StaticCredentialProvider({ accessToken: TOKEN }),
      allowlist,
      fetch: fn,
    });
    const out = await c.list(
      'test.page_edge',
      { pathParams: { page_id: '77' }, asPage: '77' },
      { maxItems: 5 },
    );
    await c.list(
      'test.page_edge',
      { pathParams: { page_id: '77' }, asPage: '77' },
      { maxItems: 5 },
    );
    expect(JSON.stringify(out)).not.toContain(pageToken);
    expect(seen[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(seen[1]!.headers.Authorization).toBe(`Bearer ${pageToken}`);
    expect(seen).toHaveLength(3); // token cached for the second call
  });
});
