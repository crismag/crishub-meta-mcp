import { redactString } from './redact.js';

/**
 * Stable, typed error codes returned to MCP clients and SDK consumers.
 * The first eight codes are the contract in docs/INTEGRATION_CONTRACTS.md;
 * ENDPOINT_NOT_ALLOWED and INTERNAL_ERROR are toolkit extensions (see ADR 0002).
 */
export const ErrorCode = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNSUPPORTED_API_VERSION: 'UNSUPPORTED_API_VERSION',
  INVALID_INPUT: 'INVALID_INPUT',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  ENDPOINT_NOT_ALLOWED: 'ENDPOINT_NOT_ALLOWED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Sanitised upstream details. Never contains tokens, URLs or request parameters. */
export interface UpstreamErrorInfo {
  httpStatus?: number;
  code?: number;
  subcode?: number;
  type?: string;
  fbtraceId?: string;
}

export interface SafeError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  upstream?: UpstreamErrorInfo;
}

export interface MetaToolErrorOptions {
  retryable?: boolean;
  retryAfterSeconds?: number;
  upstream?: UpstreamErrorInfo;
  cause?: unknown;
}

const DEFAULT_RETRYABLE: Record<ErrorCode, boolean> = {
  NOT_CONFIGURED: false,
  PERMISSION_DENIED: false,
  REVIEW_REQUIRED: false,
  TOKEN_EXPIRED: false,
  RATE_LIMITED: true,
  UNSUPPORTED_API_VERSION: false,
  INVALID_INPUT: false,
  UPSTREAM_UNAVAILABLE: true,
  ENDPOINT_NOT_ALLOWED: false,
  INTERNAL_ERROR: false,
};

export class MetaToolError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly upstream?: UpstreamErrorInfo;

  constructor(code: ErrorCode, message: string, options: MetaToolErrorOptions = {}) {
    super(
      redactString(message),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'MetaToolError';
    this.code = code;
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[code];
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
    if (options.upstream !== undefined) this.upstream = options.upstream;
  }

  toSafeError(): SafeError {
    const out: SafeError = { code: this.code, message: this.message, retryable: this.retryable };
    if (this.retryAfterSeconds !== undefined) out.retryAfterSeconds = this.retryAfterSeconds;
    if (this.upstream !== undefined) out.upstream = { ...this.upstream };
    return out;
  }

  toJSON(): SafeError {
    return this.toSafeError();
  }
}

export function isMetaToolError(err: unknown): err is MetaToolError {
  return err instanceof MetaToolError;
}

/**
 * Convert any thrown value into a client-safe error. Unknown errors never leak
 * their message (it may contain request details); they become INTERNAL_ERROR.
 */
export function toSafeError(err: unknown): SafeError {
  if (isMetaToolError(err)) return err.toSafeError();
  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Internal error. See server logs (redacted) for details.',
    retryable: false,
  };
}
