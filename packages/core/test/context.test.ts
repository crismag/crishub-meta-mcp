import { describe, expect, it } from 'vitest';
import {
  ErrorCode,
  EnvCredentialProvider,
  assertAssetAllowed,
  filterAllowedAssets,
  parseIdList,
  type ConnectionContext,
} from '@crishub-meta-mcp/core';

const ctx = (pages?: string[]): ConnectionContext => ({
  connectionId: 't',
  mode: 'mock',
  graphVersion: 'v26.0',
  assetPolicy: pages ? { pages: new Set(pages), adAccounts: new Set(['5']) } : {},
});

describe('asset policy', () => {
  it('allows everything when no allowlist is configured', () => {
    expect(() => assertAssetAllowed(ctx(), 'page', '1')).not.toThrow();
  });
  it('enforces and filters allowlists, normalising act_ prefixes', () => {
    expect(() => assertAssetAllowed(ctx(['1']), 'page', '2')).toThrowError(
      expect.objectContaining({ code: ErrorCode.PERMISSION_DENIED }),
    );
    expect(() => assertAssetAllowed(ctx(['1']), 'ad_account', 'act_5')).not.toThrow();
    expect(filterAllowedAssets(ctx(['1']), 'page', [{ id: '1' }, { id: '2' }])).toEqual([
      { id: '1' },
    ]);
  });
  it('parses id lists strictly', () => {
    expect(parseIdList('act_1, 2', 'ad_account')).toEqual(new Set(['1', '2']));
    expect(parseIdList('', 'page')).toBeUndefined();
    expect(() => parseIdList('1,abc', 'page')).toThrow();
  });
});

describe('EnvCredentialProvider', () => {
  it('reads env and validates types', async () => {
    const p = new EnvCredentialProvider({
      META_ACCESS_TOKEN: 'EAABENVTOKENDONOTUSE123456',
      META_APP_ID: '123',
      META_TOKEN_TYPE: 'system_user',
    });
    expect(p.isConfigured()).toBe(true);
    expect(p.getTokenType()).toBe('system_user');
    expect(String(await p.getAccessToken())).toBe('[REDACTED]');
    expect(() => new EnvCredentialProvider({ META_TOKEN_TYPE: 'root' })).toThrow();
    expect(() => new EnvCredentialProvider({ META_APP_ID: '12x' })).toThrow();
  });
  it('is unconfigured with an empty env', async () => {
    const p = new EnvCredentialProvider({});
    expect(p.isConfigured()).toBe(false);
    await expect(p.getAccessToken()).rejects.toMatchObject({ code: ErrorCode.NOT_CONFIGURED });
  });
});
