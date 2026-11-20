# Development roadmap

All work below is **PLANNED** unless explicitly checked off with test evidence.

## R0 — Repository foundation
- [ ] Confirm license (Apache-2.0 proposed), contribution policy and CODEOWNERS
- [ ] Choose runtime, maintained MCP SDK, package manager and release process via ADR
- [ ] Scaffold workspace, formatting, linting, typecheck, test runner, CI and dependency scanning
- [ ] Create versioned capability registry and API research ledger

**Exit:** offline CI passes on an example package and docs are reproducible.

## R1 — Secure read-only MCP MVP (v0.1.0)
- [ ] stdio MCP server, tool discovery, schema validation and mock mode
- [ ] allowlisted Graph API client, scoped credential provider and redaction
- [ ] token scope/expiry diagnostics without exposing token values
- [ ] authorized Page, business, ad account, lead-form and insights inspection
- [ ] structured errors, retries, pagination, rate limits and timeouts
- [ ] Claude/Cursor example configurations using placeholders
- [ ] mocked integration and adversarial security tests

**Exit:** reproducible local demo without credentials; optional live read-only smoke tests.

## R2 — Webhooks and lead ingestion (v0.2.0)
- [ ] challenge verification, raw-body signature validation and event fixtures
- [ ] idempotency/replay controls and sample consumer interface
- [ ] authorized lead read flow and permission diagnostics
- [ ] webhook test guide and Meta dashboard checklist

## R3 — Ecosystem adapters (v0.3.x)
- [ ] Messenger diagnostic tools
- [ ] Instagram professional account and insight tools
- [ ] WhatsApp Cloud API diagnostic tools
- [ ] Threads API diagnostic tools
- [ ] cross-version capability tests and error documentation

## R4 — Approved writes (v0.4.x)
- [ ] narrowly scoped opt-in tools with user approval, authorization and audit records
- [ ] publishing/messaging/campaign operations only after Meta policy verification
- [ ] dry-run where possible, spend caps, idempotency and operational safeguards

## R5 — Stable developer toolkit (v1.0.0)
- [ ] compatibility policy, migration guides, signed releases and security review
- [ ] complete docs and verified client examples
- [ ] integration contract validation against private platform and independent consumers

Dependencies: private platform consumes tagged releases; RealCRM consumes a separately versioned plugin. No milestone may require production credentials for CI.
