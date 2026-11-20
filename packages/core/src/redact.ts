/**
 * Redaction utilities. Defence in depth: tokens should never reach output in
 * the first place, but every log line, error message and tool result is also
 * passed through these functions before leaving the process.
 */

export const REDACTED = '[REDACTED]';

const PATTERNS: readonly RegExp[] = [
  // Meta user / Page / system-user access tokens (start with "EA").
  /\bEA[A-Za-z0-9]{16,}\b/g,
  // Instagram / Threads style tokens.
  /\b(?:IGQ|IGA|THQ|TH)[A-Za-z0-9_-]{20,}\b/g,
  // App access tokens "app_id|app_secret" or "app_id|hash".
  /\b\d{5,20}\|[A-Za-z0-9_-]{16,}\b/g,
  // Bearer / OAuth authorization header values.
  /\b(Bearer|OAuth)\s+[A-Za-z0-9._~+/=|-]{8,}/gi,
  // Sensitive query-string / form parameters.
  /\b(access_token|input_token|appsecret_proof|client_secret|app_secret|fb_exchange_token|code)=([^&\s"']+)/gi,
];

// Matched against snake_cased keys: access_token, appSecret, api_key... but not token_type.
const SENSITIVE_KEY = /(?:^|_)(?:token|secret|password|passwd|authorization|cookie|api_key|proof)$/;

const knownSecrets = new Set<string>();

/** Register a literal secret value so that it is always redacted wherever it appears. */
export function registerSecret(value: string | undefined): void {
  if (value && value.length >= 6) knownSecrets.add(value);
}

/** For tests only. */
export function clearRegisteredSecrets(): void {
  knownSecrets.clear();
}

export function redactString(input: string): string {
  let out = input;
  for (const secret of knownSecrets) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match, p1: unknown) => {
      if (typeof p1 === 'string' && /^(bearer|oauth)$/i.test(p1)) return `${p1} ${REDACTED}`;
      if (typeof p1 === 'string' && match.includes('=')) return `${p1}=${REDACTED}`;
      return REDACTED;
    });
  }
  return out;
}

export function isSensitiveKey(key: string): boolean {
  const snake = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
  return SENSITIVE_KEY.test(snake);
}

/** Deep-redact a JSON-like value: sensitive keys are masked and strings are scrubbed. */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > 32) return REDACTED as unknown as T;
  if (typeof value === 'string') return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] =
        isSensitiveKey(k) && v !== null && v !== undefined && typeof v !== 'boolean'
          ? REDACTED
          : redactDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
