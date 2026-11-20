import { describe, expect, it } from 'vitest';
import { ErrorCode, MOCK_PAGES, createMockHarness } from '@crishub-meta-mcp/core';
import { FACEBOOK_ENDPOINTS, createFacebookAdapter } from '@crishub-meta-mcp/facebook';

const harness = (opts: Parameters<typeof createMockHarness>[1] = {}) =>
  createMockHarness([createFacebookAdapter()], opts);

describe('meta_pages_list', () => {
  it('lists pages and never returns Page access tokens', async () => {
    const h = harness();
    const res = await h.invoke('meta_pages_list');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as { pages: { id: string; tasks?: string[] }[]; truncated: boolean };
    expect(data.pages.map((p) => p.id)).toEqual(MOCK_PAGES.map((p) => p.id));
    expect(data.pages[0]!.tasks).toContain('ADVERTISE');
    expect(JSON.stringify(res)).not.toMatch(/access_token|EAAMOCKPAGE/);
    expect(h.mock.calls[0]).toMatchObject({
      path: '/me/accounts',
      params: { fields: 'id,name,category,tasks' },
    });
  });

  it('filters results to the Page allowlist', async () => {
    const res = await harness({ assetPolicy: { pages: new Set([MOCK_PAGES[1]!.id]) } }).invoke(
      'meta_pages_list',
    );
    expect(res.ok && (res.data as { pages: unknown[] }).pages).toHaveLength(1);
  });

  it('returns a cursor when the limit truncates results', async () => {
    const res = await harness().invoke('meta_pages_list', { limit: 2 });
    expect(res).toMatchObject({
      ok: true,
      data: { truncated: true, next_cursor: expect.any(String) },
    });
    if (!res.ok) return;
    const next = await harness().invoke('meta_pages_list', {
      after: (res.data as { next_cursor: string }).next_cursor,
    });
    expect(next.ok && (next.data as { pages: { id: string }[] }).pages.map((p) => p.id)).toEqual([
      MOCK_PAGES[2]!.id,
    ]);
  });
});

describe('meta_pages_get', () => {
  it('returns allowlisted fields', async () => {
    const res = await harness().invoke('meta_pages_get', {
      page_id: MOCK_PAGES[0]!.id,
      fields: ['name', 'fan_count'],
    });
    expect(res).toEqual({
      ok: true,
      data: { page: { id: MOCK_PAGES[0]!.id, name: 'Example Realty Page', fan_count: 1000 } },
    });
  });

  it.each([
    [{ page_id: 'me' }],
    [{ page_id: '1/feed' }],
    [{ page_id: '1', fields: ['access_token'] }],
    [{ page_id: '1', fields: ['email'] }],
    [{ page_id: '1', url: 'https://evil.example.com' }],
  ])('rejects malicious input %j without network calls', async (input) => {
    const h = harness();
    expect(await h.invoke('meta_pages_get', input)).toMatchObject({
      ok: false,
      error: { code: ErrorCode.INVALID_INPUT },
    });
    expect(h.mock.calls).toHaveLength(0);
  });

  it('enforces the Page allowlist before calling Meta', async () => {
    const h = harness({ assetPolicy: { pages: new Set(['1']) } });
    expect(await h.invoke('meta_pages_get', { page_id: MOCK_PAGES[0]!.id })).toMatchObject({
      ok: false,
      error: { code: ErrorCode.PERMISSION_DENIED },
    });
    expect(h.mock.calls).toHaveLength(0);
  });

  it('maps a missing permission', async () => {
    expect(
      await harness({ scenario: 'permission_denied' }).invoke('meta_pages_get', {
        page_id: MOCK_PAGES[0]!.id,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: ErrorCode.PERMISSION_DENIED,
        message: expect.stringContaining('pages_read_engagement'),
      },
    });
  });
});

describe('meta_businesses_list', () => {
  it('lists businesses', async () => {
    const res = await harness().invoke('meta_businesses_list');
    expect(res.ok && (res.data as { businesses: unknown[] }).businesses).toHaveLength(2);
  });

  it('reports App Review requirements', async () => {
    expect(
      await harness({ scenario: 'review_required' }).invoke('meta_businesses_list'),
    ).toMatchObject({
      ok: false,
      error: { code: ErrorCode.REVIEW_REQUIRED },
    });
  });
});

describe('facebook endpoints', () => {
  it('never allow token fields', () => {
    for (const rule of FACEBOOK_ENDPOINTS) expect(rule.allowedFields).not.toContain('access_token');
  });
});
