import { ErrorCode, MetaToolError, type UpstreamErrorInfo } from '../errors.js';

/** Shape of a Graph API error body. https://developers.facebook.com/docs/graph-api/guides/error-handling */
export interface GraphErrorBody {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  is_transient?: unknown;
  fbtrace_id?: unknown;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);
const TOKEN_CODES = new Set([102, 190]);
const VERSION_CODES = new Set([12, 2635]);
const REVIEW_HINT =
  /app review|advanced access|standard access|requires? (?:the )?['"]?[a-z_]+['"]? permission.*review/i;

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Map a Graph error to a typed, client-safe MetaToolError. Upstream messages are NOT forwarded verbatim. */
export function mapGraphError(
  httpStatus: number,
  body: GraphErrorBody | undefined,
  retryAfterSeconds?: number,
): MetaToolError {
  const code = num(body?.code);
  const subcode = num(body?.error_subcode);
  const upstream: UpstreamErrorInfo = { httpStatus };
  if (code !== undefined) upstream.code = code;
  if (subcode !== undefined) upstream.subcode = subcode;
  if (typeof body?.type === 'string') upstream.type = body.type.slice(0, 64);
  if (typeof body?.fbtrace_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.fbtrace_id)) {
    upstream.fbtraceId = body.fbtrace_id;
  }
  const message = typeof body?.message === 'string' ? body.message : '';
  const opts = (extra: { retryable?: boolean } = {}) => ({
    upstream,
    ...extra,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  });

  if (code !== undefined && TOKEN_CODES.has(code)) {
    const reason =
      subcode === 463
        ? 'The access token has expired.'
        : subcode === 460
          ? 'The access token was invalidated (password change).'
          : subcode === 458
            ? 'The user has not authorized this app.'
            : 'The access token is invalid or expired.';
    return new MetaToolError(
      ErrorCode.TOKEN_EXPIRED,
      `${reason} Re-authorize outside the chat.`,
      opts(),
    );
  }
  if (
    httpStatus === 429 ||
    (code !== undefined && (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014)))
  ) {
    return new MetaToolError(
      ErrorCode.RATE_LIMITED,
      'Meta rate limit reached. Retry later.',
      opts(),
    );
  }
  if (code !== undefined && VERSION_CODES.has(code)) {
    return new MetaToolError(
      ErrorCode.UNSUPPORTED_API_VERSION,
      'The requested Graph API version or feature is deprecated for this app.',
      opts(),
    );
  }
  if (
    code === 10 ||
    (code !== undefined && code >= 200 && code <= 299) ||
    code === 3 ||
    code === 368
  ) {
    if (REVIEW_HINT.test(message)) {
      return new MetaToolError(
        ErrorCode.REVIEW_REQUIRED,
        'This operation requires a permission or access level that needs Meta App Review.',
        opts(),
      );
    }
    const perm =
      /\b(pages_[a-z_]+|ads_[a-z_]+|business_management|leads_retrieval|read_insights)\b/.exec(
        message,
      );
    return new MetaToolError(
      ErrorCode.PERMISSION_DENIED,
      perm
        ? `Permission denied by Meta (missing or ungranted permission: ${perm[1]}).`
        : 'Permission denied by Meta for this asset or operation.',
      opts(),
    );
  }
  if (code === 100 || code === 803 || code === 2642 || code === 3018) {
    return new MetaToolError(
      ErrorCode.INVALID_INPUT,
      'Meta rejected the request parameters.',
      opts(),
    );
  }
  if (code === 1 || code === 2 || body?.is_transient === true || httpStatus >= 500) {
    return new MetaToolError(
      ErrorCode.UPSTREAM_UNAVAILABLE,
      'Meta API is temporarily unavailable.',
      opts({ retryable: true }),
    );
  }
  if (httpStatus === 401) {
    return new MetaToolError(ErrorCode.TOKEN_EXPIRED, 'The access token was rejected.', opts());
  }
  if (httpStatus === 403) {
    return new MetaToolError(ErrorCode.PERMISSION_DENIED, 'Permission denied by Meta.', opts());
  }
  return new MetaToolError(
    ErrorCode.UPSTREAM_UNAVAILABLE,
    'Unexpected Meta API error.',
    opts({ retryable: false }),
  );
}
