import { describe, expect, it } from 'vitest';
import { ErrorCode, MOCK_AD_ACCOUNTS, MOCK_PAGES, createMockHarness } from '@crishub-meta-mcp/core';
import { MAX_INSIGHTS_ROWS, createMarketingAdapter } from '@crishub-meta-mcp/marketing';

const ACCT = MOCK_AD_ACCOUNTS[0]!.id;
const harness = (opts: Parameters<typeof createMockHarness>[1] = {}) =>
  createMockHarness([createMarketingAdapter()], { enableExperimental: true, ...opts });

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('experimental gating', () => {
  it('does not register unverified tools unless enabled', () => {
    const names = createMockHarness([createMarketingAdapter()])
      .tools.list()
      .map((t) => t.name);
    expect(names).toContain('meta_insights_query');
    expect(names).not.toContain('meta_ad_accounts_list');
    expect(names).not.toContain('meta_lead_forms_list');
  });
});

describe('meta_ad_accounts_list / get', () => {
  it('paginates across Graph pages up to the limit', async () => {
    const h = harness();
    const res = await h.invoke('meta_ad_accounts_list', { limit: 100 });
    expect(res.ok && (res.data as { ad_accounts: unknown[] }).ad_accounts).toHaveLength(30);
  });

  it('gets one account by bare or act_ id', async () => {
    for (const id of [ACCT, ACCT.replace('act_', '')]) {
      const res = await harness().invoke('meta_ad_accounts_get', { ad_account_id: id });
      expect(res).toMatchObject({ ok: true, data: { ad_account: { id: ACCT, currency: 'USD' } } });
    }
  });

  it('enforces the ad account allowlist', async () => {
    const h = harness({ assetPolicy: { adAccounts: new Set(['1']) } });
    expect(await h.invoke('meta_ad_accounts_get', { ad_account_id: ACCT })).toMatchObject({
      ok: false,
      error: { code: ErrorCode.PERMISSION_DENIED },
    });
    expect(h.mock.calls).toHaveLength(0);
  });

  it('surfaces rate limits with retry guidance', async () => {
    expect(
      await harness({ scenario: 'rate_limited' }).invoke('meta_ad_accounts_get', {
        ad_account_id: ACCT,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: ErrorCode.RATE_LIMITED,
        retryable: true,
        retryAfterSeconds: 300,
        upstream: { code: 80004 },
      },
    });
  });
});

describe('meta_campaigns_list', () => {
  it('filters by effective status', async () => {
    const h = harness();
    const res = await h.invoke('meta_campaigns_list', {
      ad_account_id: ACCT,
      effective_status: ['PAUSED'],
    });
    expect(
      res.ok &&
        (res.data as { campaigns: { effective_status: string }[] }).campaigns.map(
          (c) => c.effective_status,
        ),
    ).toEqual(['PAUSED']);
    expect(h.mock.calls[0]!.params.effective_status).toBe('["PAUSED"]');
  });

  it('rejects unknown statuses', async () => {
    expect(
      await harness().invoke('meta_campaigns_list', {
        ad_account_id: ACCT,
        effective_status: ['ALL'],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: ErrorCode.INVALID_INPUT },
    });
  });
});

describe('meta_insights_query', () => {
  it('returns schema-valid rows for a preset', async () => {
    const h = harness();
    const res = await h.invoke('meta_insights_query', {
      ad_account_id: ACCT,
      fields: ['impressions', 'clicks', 'spend'],
      date_preset: 'last_7d',
      time_increment: '1',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as { rows: Record<string, string>[]; row_count: number; level: string };
    expect(data.level).toBe('account');
    expect(data.row_count).toBe(7);
    expect(Object.keys(data.rows[0]!).sort()).toEqual([
      'clicks',
      'date_start',
      'date_stop',
      'impressions',
      'spend',
    ]);
    expect(h.mock.calls[0]!.params).toMatchObject({
      level: 'account',
      date_preset: 'last_7d',
      fields: 'impressions,clicks,spend',
    });
  });

  it('is deterministic', async () => {
    const input = { ad_account_id: ACCT, level: 'campaign', date_preset: 'last_30d' };
    expect(await harness().invoke('meta_insights_query', input)).toEqual(
      await harness().invoke('meta_insights_query', input),
    );
  });

  it('caps rows', async () => {
    const res = await harness().invoke('meta_insights_query', {
      ad_account_id: ACCT,
      level: 'campaign',
      time_increment: '1',
      date_preset: 'last_30d',
      max_rows: 10,
    });
    expect(res).toMatchObject({ ok: true, data: { row_count: 10, truncated: true } });
  });

  it('accepts a bounded time_range', async () => {
    const res = await harness().invoke('meta_insights_query', {
      ad_account_id: ACCT,
      time_range: { since: isoDaysAgo(10), until: isoDaysAgo(1) },
    });
    expect(res.ok).toBe(true);
  });

  it.each([
    [
      'both preset and range',
      { date_preset: 'last_7d', time_range: { since: isoDaysAgo(3), until: isoDaysAgo(1) } },
    ],
    ['range too long', { time_range: { since: isoDaysAgo(200), until: isoDaysAgo(1) } }],
    ['inverted range', { time_range: { since: isoDaysAgo(1), until: isoDaysAgo(5) } }],
    ['future range', { time_range: { since: isoDaysAgo(1), until: isoDaysAgo(-10) } }],
    ['too old', { time_range: { since: isoDaysAgo(1200), until: isoDaysAgo(1190) } }],
    ['bad date', { time_range: { since: '2026-13-01', until: '2026-13-02' } }],
    ['unknown field', { fields: ['ssn'] }],
    ['unbounded preset', { date_preset: 'maximum' }],
    ['row cap', { max_rows: MAX_INSIGHTS_ROWS + 1 }],
    ['breakdowns not allowed', { breakdowns: ['age'] }],
  ])('rejects %s', async (_l, extra) => {
    const h = harness();
    expect(await h.invoke('meta_insights_query', { ad_account_id: ACCT, ...extra })).toMatchObject({
      ok: false,
      error: { code: ErrorCode.INVALID_INPUT },
    });
    expect(h.mock.calls).toHaveLength(0);
  });
});

describe('meta_lead_forms_list', () => {
  it('uses a server-resolved Page token and returns no tokens', async () => {
    const h = harness();
    const res = await h.invoke('meta_lead_forms_list', { page_id: MOCK_PAGES[0]!.id });
    expect(res).toMatchObject({
      ok: true,
      data: {
        lead_forms: [
          { id: '900000000000501', name: 'Example Buyer Inquiry Form' },
          { id: '900000000000502' },
        ],
      },
    });
    expect(JSON.stringify(res)).not.toMatch(/EAAMOCK|access_token/);
    expect(h.mock.calls.map((c) => c.authorized)).toEqual(['user', 'page']);
    expect(h.mock.calls[1]!.params.fields).toBe('id,name');
  });

  it('maps an expired token', async () => {
    expect(
      await harness({ scenario: 'expired_token' }).invoke('meta_lead_forms_list', {
        page_id: MOCK_PAGES[0]!.id,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: ErrorCode.TOKEN_EXPIRED },
    });
  });
});
