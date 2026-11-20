# Tool catalog (v0.1.0-dev)

All tools are read-only (`readOnlyHint: true`), take no credentials or tenant ids, validate input strictly and
return `structuredContent` matching an advertised output schema. Errors return `isError: true` with
`{"error": {"code", "message", "retryable", "retryAfterSeconds?", "upstream?"}}`.

| Tool                     | Backed by                    | Status     | Default | Notes                                                                                       |
| ------------------------ | ---------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------- |
| `meta_connection_status` | local                        | —          | on      | Mode, configured?, Graph version, allowlist sizes, last rate-limit usage. No network.       |
| `meta_capabilities_list` | local                        | —          | on      | Capability registry with doc status and sources. No network.                                |
| `meta_token_permissions` | debug_token, /me/permissions | VERIFIED   | on      | Validity, type, app, expiry, scopes, declined/expired permissions. Never returns the token. |
| `meta_businesses_list`   | /me/businesses               | VERIFIED   | on      | Paginated (`limit`, `after`).                                                               |
| `meta_pages_list`        | /me/accounts                 | VERIFIED   | on      | id, name, category, tasks. Page tokens never requested or returned.                         |
| `meta_pages_get`         | /{page-id}                   | VERIFIED   | on      | Allowlisted fields only.                                                                    |
| `meta_ad_accounts_get`   | /act_{id}                    | VERIFIED   | on      | Status, currency, timezone, raw amount_spent.                                               |
| `meta_campaigns_list`    | /act_{id}/campaigns          | VERIFIED   | on      | Optional `effective_status` filter.                                                         |
| `meta_insights_query`    | /act_{id}/insights           | VERIFIED   | on      | Allowlisted fields; preset or ≤ 93-day range; ≤ 500 rows; synchronous.                      |
| `meta_ad_accounts_list`  | /me/adaccounts               | UNVERIFIED | off     | Enable with `META_ENABLE_UNVERIFIED_TOOLS=true`.                                            |
| `meta_lead_forms_list`   | /{page-id}/leadgen_forms     | UNVERIFIED | off     | Page token resolved server-side; `id,name` by default; no lead data.                        |

## Error codes

| Code                    | Meaning                                                                        | Retryable                       |
| ----------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| NOT_CONFIGURED          | No credentials in the server environment                                       | no                              |
| PERMISSION_DENIED       | Meta denied the permission/asset, or the asset is outside the server allowlist | no                              |
| REVIEW_REQUIRED         | Needs App Review / Advanced Access                                             | no                              |
| TOKEN_EXPIRED           | Token expired, invalidated or app not authorized                               | no                              |
| RATE_LIMITED            | Meta rate limit (codes 4, 17, 32, 341, 613, 80000–80014, HTTP 429)             | yes (after `retryAfterSeconds`) |
| UNSUPPORTED_API_VERSION | Version not supported by toolkit or deprecated by Meta                         | no                              |
| INVALID_INPUT           | Input failed validation (before any network call) or Meta rejected parameters  | no                              |
| UPSTREAM_UNAVAILABLE    | Timeout, network error, 5xx, malformed/oversized response                      | sometimes                       |
| ENDPOINT_NOT_ALLOWED    | Operation is not allowlisted                                                   | no                              |
| INTERNAL_ERROR          | Unexpected failure (details only in redacted server logs)                      | no                              |
