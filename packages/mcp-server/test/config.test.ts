import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@crishub-meta-mcp/core';
import { loadConfig } from '@crishub-meta-mcp/server';

describe('loadConfig', () => {
  it('defaults to safe mock mode', () => {
    expect(loadConfig({})).toMatchObject({
      mode: 'mock',
      graphVersion: 'v26.0',
      adapters: ['facebook', 'marketing'],
      enableUnverifiedTools: false,
      assetPolicy: {},
    });
  });

  it('parses allowlists and options', () => {
    const c = loadConfig({
      META_MODE: 'live',
      META_GRAPH_VERSION: 'v25.0',
      META_ADAPTERS: 'facebook',
      META_ALLOWED_PAGE_IDS: '1,2',
      META_ALLOWED_AD_ACCOUNT_IDS: 'act_3',
      META_ENABLE_UNVERIFIED_TOOLS: 'true',
    });
    expect(c).toMatchObject({
      mode: 'live',
      graphVersion: 'v25.0',
      adapters: ['facebook'],
      enableUnverifiedTools: true,
    });
    expect([...c.assetPolicy.pages!]).toEqual(['1', '2']);
    expect([...c.assetPolicy.adAccounts!]).toEqual(['3']);
  });

  it.each([
    [{ META_MODE: 'prod' }, ErrorCode.INVALID_INPUT],
    [{ META_GRAPH_VERSION: 'v19.0' }, ErrorCode.UNSUPPORTED_API_VERSION],
    [{ META_ADAPTERS: 'facebook,shell' }, ErrorCode.INVALID_INPUT],
    [{ META_MOCK_SCENARIO: 'nope' }, ErrorCode.INVALID_INPUT],
    [{ META_TIMEOUT_MS: '1' }, ErrorCode.INVALID_INPUT],
    [{ META_ALLOWED_PAGE_IDS: '1,../2' }, ErrorCode.INVALID_INPUT],
  ])('rejects %j', (env, code) => {
    expect(() => loadConfig(env)).toThrowError(expect.objectContaining({ code }));
  });
});
