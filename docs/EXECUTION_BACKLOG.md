# Execution backlog and acceptance gates

## Sprint 0 — Architecture and tooling

- [x] Inspect repository state and open issues; identify overlap.
- [x] ADR: TypeScript runtime, package manager, maintained MCP SDK, transport, test runner, packaging and releases.
- [x] Scaffold workspace with lint, format, typecheck, tests, CI and security checks.
- [x] Define errors, credential provider, connection context, capability registry and adapter interface.
- [x] Create offline mock server and minimal sample MCP tool.
      **Acceptance:** fresh checkout installs and passes CI without Meta credentials. _Status: passes locally (`pnpm check`); see PR CI._

## Sprint 1 — Read-only Graph and diagnostics

- [x] Graph HTTP client with fixed official host, API version, request allowlist, validation, pagination, timeouts and safe retries.
- [x] Meta token metadata diagnostics with redacted outputs.
- [x] Business/Page/ad account/lead form listing where official APIs support the exact endpoints.
- [x] Ads insights query with field allowlist, date-range and row caps.
- [x] Scope/permission errors, 429 behavior and expired token tests.
      **Acceptance:** mocked tool calls produce schema-valid outputs; prohibited endpoints fail closed. _Status: met in mock mode (packages/mcp-server/test/mcp.test.ts). `/me/adaccounts` and lead form reads are experimental (UNVERIFIED docs)._

## Sprint 2 — Lead Ads and webhook utilities

- [ ] Lead form and lead retrieval adapters; protect lead PII and avoid diagnostic dumps.
- [ ] Raw-body signature and challenge verification; invalid signatures fail.
- [ ] Event schemas, normalized fixtures, deduplication hooks and consumer sample.
- [ ] Developer Dashboard checklist for Page subscription and lead access.
      **Acceptance:** positive/negative signature tests, duplicate delivery tests and permission failure tests.

## Sprint 3 — Messaging ecosystem diagnostics

- [ ] Messenger capability and subscription checks.
- [ ] Instagram professional account and insights adapters.
- [ ] WhatsApp WABA/phone/templates diagnostic adapters.
- [ ] Threads API discovery and capability checks.
      **Acceptance:** each adapter is optional and fails gracefully when unconfigured.

## Sprint 4 — Human-approved mutations

- [ ] ADR on tool risk levels, consent, approvals and audit records.
- [ ] Narrow allowlisted write tools (no arbitrary API passthrough).
- [ ] Dry-run where supported, human-in-loop gating and integration tests.
      **Acceptance:** no side-effect action without explicit approval and verified scopes.

## Sprint 5 — Public release quality

- [ ] Choose and add license only with owner approval.
- [ ] Contribution guide, security policy, release automation and versioning.
- [ ] Complete installation and client setup docs; validated examples.
- [ ] Publish stable compatibility contract with private platform.
      **Acceptance:** reproducible release build, passing security review, migration notes.

## Always-on workstream

- [x] Update docs/API_RESEARCH_LEDGER.md for every endpoint (Sprint 0–1 endpoints).
- [ ] Update CHANGELOG and roadmap on each PR.
- [ ] Maintain tests for expired tokens, malicious tool inputs, webhook forgery, API version mismatches, pagination exhaustion and secret leakage.
- [ ] No customer data, app secrets, live access tokens or production account IDs in repository.
