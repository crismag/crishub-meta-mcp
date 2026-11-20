# ADR 0002: Tool contract, naming and phase-1 safety model

- Status: Accepted (pending owner review)
- Date: 2026-11-20

## Decisions

1. **Tool names** are `meta_<domain>_<action>` (snake case, ≤ 64 chars), e.g. `meta_pages_list`.
   The planning catalog used dotted names (`meta.pages.list`); dots are permitted by MCP but rejected by
   several model APIs' tool-name patterns (`^[a-zA-Z0-9_-]{1,64}$`), so underscores are used for portability.
2. **No passthrough.** The Graph client only executes `EndpointRule`s registered by adapters: fixed host
   `graph.facebook.com`, fixed supported version, GET only, typed path-parameter validators, field and query
   allowlists, cursor validation and `paging.next` URLs never followed. Unknown operations fail with
   `ENDPOINT_NOT_ALLOWED` before any network I/O.
3. **Risk levels.** `ToolRegistry` accepts only `read` tools in phase 1; registering `write`/`destructive`
   tools throws. Sprint 4 will introduce approvals via a new ADR.
4. **Documentation gating.** Every tool is backed by `Capability` records citing a `developers.facebook.com`
   source with a status from `docs/API_RESEARCH_LEDGER.md`. Tools whose endpoint is `UNVERIFIED` are marked
   `experimental` and are only registered when `META_ENABLE_UNVERIFIED_TOOLS=true`.
5. **Credentials.** `CredentialProvider` returns `SecretToken` objects whose string/JSON/inspect forms are
   `[REDACTED]`; only the transport calls `reveal()`. Tokens travel in the `Authorization` header
   (except `debug_token`'s required `input_token` query parameter). `appsecret_proof` is added when an app
   secret is configured. Page tokens are resolved internally through an `internal` rule and cached in memory.
6. **Connection context** is server-owned (`ConnectionContext`): tools never accept tenant, app, token or
   connection ids. Optional asset allowlists (`META_ALLOWED_*_IDS`) are enforced before calls and on list output.
7. **Errors.** Stable codes from INTEGRATION_CONTRACTS.md plus two extensions: `ENDPOINT_NOT_ALLOWED`
   (prohibited operation) and `INTERNAL_ERROR` (unexpected failure, details only in redacted logs). Upstream
   Meta messages are not forwarded verbatim; only numeric code/subcode, type, HTTP status and fbtrace id.
8. **Retries.** Only `UPSTREAM_UNAVAILABLE` (HTTP 5xx, codes 1/2, `is_transient`, network errors, timeouts)
   is retried: max 2 retries, exponential backoff from 250 ms with jitter, capped at 4 s. Rate limits are
   never retried automatically; `retryAfterSeconds` is derived from `estimated_time_to_regain_access`.
9. **Output.** Inputs are validated strictly (unknown keys rejected); outputs are validated against the
   declared output schema (fail closed) and deep-redacted before returning `structuredContent`.

## Consequences

`meta_ad_accounts_list` and `meta_lead_forms_list` are off by default until their documentation is verified.
Hosts wanting other tools must add adapters with their own allowlisted rules rather than a generic proxy.
