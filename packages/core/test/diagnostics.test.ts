import { describe, expect, it } from 'vitest';
import {
  CapabilityRegistry,
  ErrorCode,
  MOCK_ACCESS_TOKEN,
  StaticCredentialProvider,
  createMockHarness,
  parseGraphVersion,
} from '@crishub-meta-mcp/core';

describe('diagnostics tools (mock)', () => {
  it('meta_token_permissions returns metadata without tokens or asset ids', async () => {
    const h = createMockHarness([]);
    const res = await h.invoke('meta_token_permissions');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({
      is_valid: true,
      token_type: 'USER',
      app_id: '900000000000001',
      expires_at: '2026-09-21T14:13:20.000Z',
      permissions: { declined: ['ads_management'] },
    });
    const text = JSON.stringify(res);
    expect(text).not.toContain(MOCK_ACCESS_TOKEN);
    expect(text).not.toContain('900000000000101'); // granular scope target ids are counted, not listed
    expect(text).not.toContain('900000000000999'); // user id not returned
  });

  it('meta_connection_status works without network', async () => {
    const h = createMockHarness([]);
    const res = await h.invoke('meta_connection_status');
    expect(res).toMatchObject({
      ok: true,
      data: { mode: 'mock', configured: true, graph_version: 'v26.0' },
    });
    expect(h.mock.calls).toHaveLength(0);
  });

  it('reports NOT_CONFIGURED when no token is present', async () => {
    const h = createMockHarness([], { credentials: new StaticCredentialProvider({}) });
    expect(await h.invoke('meta_token_permissions')).toMatchObject({
      ok: false,
      error: { code: ErrorCode.NOT_CONFIGURED },
    });
    expect(h.mock.calls).toHaveLength(0);
  });

  it('maps an expired token', async () => {
    const res = await createMockHarness([], { scenario: 'expired_token' }).invoke(
      'meta_token_permissions',
    );
    expect(res).toMatchObject({
      ok: false,
      error: { code: ErrorCode.TOKEN_EXPIRED, upstream: { code: 190, subcode: 463 } },
    });
  });

  it('lists capabilities with official sources', async () => {
    const res = await createMockHarness([]).invoke('meta_capabilities_list');
    expect(
      res.ok &&
        (res.data as { capabilities: { docs_url: string }[] }).capabilities.every((c) =>
          c.docs_url.startsWith('https://developers.facebook.com/'),
        ),
    ).toBe(true);
  });
});

describe('CapabilityRegistry', () => {
  it('requires an official documentation URL', () => {
    expect(() =>
      new CapabilityRegistry().register({
        id: 'x',
        adapter: 'x',
        title: 'x',
        operation: 'GET /x',
        requiredPermissions: [],
        tokenTypes: [],
        riskLevel: 'read',
        dataClassification: 'public',
        status: 'VERIFIED',
        docsUrl: 'https://example.com/blog',
      }),
    ).toThrow(/official/);
  });
});

describe('parseGraphVersion', () => {
  it('defaults and rejects unsupported versions', () => {
    expect(parseGraphVersion(undefined)).toBe('v26.0');
    expect(parseGraphVersion('v25.0')).toBe('v25.0');
    expect(() => parseGraphVersion('v24.0')).toThrowError(
      expect.objectContaining({ code: ErrorCode.UNSUPPORTED_API_VERSION }),
    );
    expect(() => parseGraphVersion('v26.0/../../x')).toThrow();
  });
});
