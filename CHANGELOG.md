# Changelog

All notable changes are documented here. The project follows semver from its first tagged release.

## [Unreleased] — 0.1.0-dev

### Added

- pnpm/TypeScript workspace (`core`, `facebook`, `marketing`, `server`), ESLint, Prettier, Vitest, GitHub Actions CI
  with offline tests, stdio smoke test, secret scanning, dependency audit and review (ADR 0001).
- Core contracts: typed error codes, redaction and `SecretToken`, credential providers (static/env), server-owned
  connection context with optional asset allowlists, capability registry, adapter and tool contracts (ADR 0002).
- Allowlisted read-only Graph client: fixed host and version (v25.0/v26.0), validated path/fields/query/cursors,
  Authorization-header tokens, `appsecret_proof`, bounded retries/backoff, timeouts, response size caps, cursor
  pagination with budgets, usage-header parsing, internal Page-token resolution.
- Deterministic mock Graph transport with failure scenarios.
- Tools: `meta_connection_status`, `meta_capabilities_list`, `meta_token_permissions`, `meta_businesses_list`,
  `meta_pages_list`, `meta_pages_get`, `meta_ad_accounts_get`, `meta_campaigns_list`, `meta_insights_query`;
  experimental (off by default) `meta_ad_accounts_list`, `meta_lead_forms_list`.
- Claude Desktop, Cursor and Claude Code configuration examples; SDK usage example.
- API research ledger with official sources verified 2026-11-20.

### Not included

- Live Meta verification, webhooks, lead retrieval, messaging/Instagram/WhatsApp/Threads adapters, write tools,
  license and releases.
