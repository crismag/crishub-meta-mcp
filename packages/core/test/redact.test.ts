import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { REDACTED, SecretToken, redactDeep, redactString } from '@crishub-meta-mcp/core';

describe('redactString', () => {
  it.each([
    ['user token', 'token EAAB1234567890abcdefghijkl used', 'EAAB1234567890abcdefghijkl'],
    ['app token', 'app 123456789|abcdefghijklmnopqrstu', 'abcdefghijklmnopqrstu'],
    ['bearer header', 'Authorization: Bearer abc.def.ghi-jkl', 'abc.def.ghi-jkl'],
    [
      'access_token query',
      'https://graph.facebook.com/v26.0/me?access_token=SECRETVALUE&x=1',
      'SECRETVALUE',
    ],
    ['appsecret_proof', 'appsecret_proof=deadbeefcafe', 'deadbeefcafe'],
    ['input_token', 'input_token=XYZXYZXYZ', 'XYZXYZXYZ'],
  ])('redacts %s', (_label, input, secret) => {
    const out = redactString(input);
    expect(out).not.toContain(secret);
    expect(out).toContain(REDACTED);
  });

  it('redacts registered literal secrets of any shape', () => {
    const t = new SecretToken('plain-looking-secret-42');
    expect(redactString('value plain-looking-secret-42 here')).toBe(`value ${REDACTED} here`);
    expect(t.reveal()).toBe('plain-looking-secret-42');
  });

  it('leaves ordinary text alone', () => {
    expect(redactString('Page 900000000000101 has 1000 fans')).toBe(
      'Page 900000000000101 has 1000 fans',
    );
  });
});

describe('redactDeep', () => {
  it('masks sensitive keys and scrubs nested strings', () => {
    const out = redactDeep({
      access_token: 'anything',
      nested: { appSecret: 'x', note: 'Bearer abcdefghijk', ok: 1 },
      list: ['EAAB1234567890abcdefghijkl'],
      is_token_valid: true,
    });
    expect(out).toEqual({
      access_token: REDACTED,
      nested: { appSecret: REDACTED, note: `Bearer ${REDACTED}`, ok: 1 },
      list: [REDACTED],
      is_token_valid: true,
    });
  });
});

describe('SecretToken', () => {
  it('never serialises its value', () => {
    const t = new SecretToken('EAAB_super_secret_value_123456');
    expect(String(t)).toBe(REDACTED);
    expect(`${t}`).toBe(REDACTED);
    expect(JSON.stringify({ t })).toBe(`{"t":"${REDACTED}"}`);
    expect(inspect(t)).not.toContain('super_secret');
  });

  it('rejects empty values', () => {
    expect(() => new SecretToken('  ')).toThrow(TypeError);
  });
});

describe('isSensitiveKey', () => {
  it('flags credential keys but not metadata keys', async () => {
    const { isSensitiveKey } = await import('@crishub-meta-mcp/core');
    for (const k of [
      'access_token',
      'token',
      'page_token',
      'appSecret',
      'client_secret',
      'Authorization',
      'appsecret_proof',
      'apiKey',
    ]) {
      expect(isSensitiveKey(k), k).toBe(true);
    }
    for (const k of ['token_type', 'is_token_valid', 'tokens_count', 'name', 'secretary']) {
      expect(isSensitiveKey(k), k).toBe(false);
    }
  });
});
