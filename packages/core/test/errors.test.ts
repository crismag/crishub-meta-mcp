import { describe, expect, it } from 'vitest';
import { ErrorCode, MetaToolError, mapGraphError, toSafeError } from '@crishub-meta-mcp/core';

describe('mapGraphError', () => {
  it.each([
    [400, { code: 190, error_subcode: 463 }, ErrorCode.TOKEN_EXPIRED],
    [400, { code: 190, error_subcode: 467 }, ErrorCode.TOKEN_EXPIRED],
    [400, { code: 102 }, ErrorCode.TOKEN_EXPIRED],
    [400, { code: 4 }, ErrorCode.RATE_LIMITED],
    [400, { code: 17 }, ErrorCode.RATE_LIMITED],
    [400, { code: 32 }, ErrorCode.RATE_LIMITED],
    [400, { code: 613 }, ErrorCode.RATE_LIMITED],
    [400, { code: 80004 }, ErrorCode.RATE_LIMITED],
    [429, undefined, ErrorCode.RATE_LIMITED],
    [403, { code: 10, message: '(#10) Permission denied' }, ErrorCode.PERMISSION_DENIED],
    [
      403,
      { code: 200, message: '(#200) Requires pages_read_engagement permission' },
      ErrorCode.PERMISSION_DENIED,
    ],
    [
      403,
      { code: 10, message: 'needs Advanced Access, which requires App Review' },
      ErrorCode.REVIEW_REQUIRED,
    ],
    [400, { code: 2635 }, ErrorCode.UNSUPPORTED_API_VERSION],
    [400, { code: 100 }, ErrorCode.INVALID_INPUT],
    [500, { code: 2, is_transient: true }, ErrorCode.UPSTREAM_UNAVAILABLE],
    [503, undefined, ErrorCode.UPSTREAM_UNAVAILABLE],
  ])('HTTP %i %j -> %s', (status, body, expected) => {
    expect(mapGraphError(status, body).code).toBe(expected);
  });

  it('marks only transient upstream failures and rate limits as retryable', () => {
    expect(mapGraphError(500, { code: 1 }).retryable).toBe(true);
    expect(mapGraphError(400, { code: 4 }).retryable).toBe(true);
    expect(mapGraphError(400, { code: 190 }).retryable).toBe(false);
  });

  it('does not forward upstream messages verbatim', () => {
    const err = mapGraphError(400, {
      code: 100,
      message: 'Invalid parameter access_token=EAAB1234567890abcdefghij',
    });
    expect(err.message).not.toContain('EAAB');
    expect(err.message).not.toContain('access_token');
  });

  it('names the missing permission when Meta reports one', () => {
    expect(
      mapGraphError(403, { code: 200, message: 'Requires ads_read permission' }).message,
    ).toContain('ads_read');
  });

  it('keeps only a well-formed fbtrace id', () => {
    expect(mapGraphError(400, { code: 1, fbtrace_id: 'Abc_123' }).upstream?.fbtraceId).toBe(
      'Abc_123',
    );
    expect(
      mapGraphError(400, { code: 1, fbtrace_id: 'a b<script>' }).upstream?.fbtraceId,
    ).toBeUndefined();
  });
});

describe('toSafeError', () => {
  it('hides unknown error messages', () => {
    const safe = toSafeError(new Error('db password=hunter2 at host internal'));
    expect(safe.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(safe.message).not.toContain('hunter2');
  });

  it('redacts MetaToolError messages', () => {
    const safe = toSafeError(
      new MetaToolError(ErrorCode.INVALID_INPUT, 'bad Bearer abcdefghijklmnop'),
    );
    expect(safe.message).not.toContain('abcdefghijklmnop');
  });
});
