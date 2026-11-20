import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  EndpointAllowlist,
  ErrorCode,
  validatePathParam,
  type EndpointRule,
} from '@crishub-meta-mcp/core';

const base: EndpointRule = {
  id: 'test.rule',
  method: 'GET',
  template: '/{page_id}',
  pathParams: { page_id: 'numeric_id' },
  allowedFields: ['id', 'name'],
  defaultFields: ['id'],
  paginated: false,
  tokenType: 'primary',
  responseSchema: z.object({ id: z.string() }),
};

describe('EndpointAllowlist', () => {
  it('rejects non-GET rules', () => {
    expect(() => new EndpointAllowlist().register({ ...base, method: 'POST' as 'GET' })).toThrow(
      /Only GET/,
    );
  });
  it('rejects public rules that expose forbidden fields', () => {
    expect(() =>
      new EndpointAllowlist().register({ ...base, allowedFields: ['id', 'access_token'] }),
    ).toThrow(/may not allow/);
  });
  it('rejects templates with traversal, query strings or unbound placeholders', () => {
    const a = new EndpointAllowlist();
    expect(() => a.register({ ...base, id: 'a', template: '/../x' })).toThrow();
    expect(() => a.register({ ...base, id: 'b', template: '/{page_id}?x=1' })).toThrow();
    expect(() => a.register({ ...base, id: 'c', template: '/{other}' })).toThrow(/Unbound/);
  });
  it('rejects duplicate ids and default fields outside the allowlist', () => {
    const a = new EndpointAllowlist();
    a.register(base);
    expect(() => a.register(base)).toThrow(/Duplicate/);
    expect(() => a.register({ ...base, id: 'd', defaultFields: ['secret_field'] })).toThrow(
      /Default field/,
    );
  });
  it('fails closed for unknown operations', () => {
    expect(() => new EndpointAllowlist().require('graph.anything')).toThrowError(
      expect.objectContaining({ code: ErrorCode.ENDPOINT_NOT_ALLOWED }),
    );
  });
});

describe('validatePathParam', () => {
  it.each([
    '../me',
    'me',
    '123/feed',
    '123?fields=access_token',
    '１２３',
    '',
    '1'.repeat(21),
    'act_123',
  ])('rejects numeric_id %j', (v) => {
    expect(() => validatePathParam('numeric_id', 'page_id', v)).toThrow();
  });
  it('normalises ad account ids', () => {
    expect(validatePathParam('ad_account_id', 'a', '123')).toBe('act_123');
    expect(validatePathParam('ad_account_id', 'a', 'act_123')).toBe('act_123');
    expect(() => validatePathParam('ad_account_id', 'a', 'act_12/insights')).toThrow();
  });
  it('only allows "me" for self params', () => {
    expect(validatePathParam('self', 'user', undefined)).toBe('me');
    expect(() => validatePathParam('self', 'user', '12345')).toThrow();
  });
});
