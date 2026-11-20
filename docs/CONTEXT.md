# Product and development context

## Product
CRISHUB Meta MCP is a reusable public developer toolkit for connecting authorized Meta services to MCP-capable AI tools and conventional applications. It is **not** a CRM, hosted SaaS or multi-tenant credential store.

## Goals
- Standardize supported Meta APIs behind typed adapters and a stable MCP tool catalog.
- Make configuration auditable, permission-aware and reproducible.
- Support developers who use Claude/Cursor; other MCP clients should work without proprietary assumptions.
- Supply mock-first local development, integration tests, operational diagnostics and precise setup documentation.
- Permit consumer apps to operate when Meta is disconnected.

## Non-goals
- Bypassing Meta App Review, business verification or permission gates.
- Unrestricted agent-driven marketing writes.
- Managing customers, billing, hosted secrets or production webhook relay (private platform responsibility).
- Browser automation of dashboard-only actions as an implicit capability.

## Proposed package layout
```text
packages/
  core/                 # auth interfaces, Graph transport, errors, schemas
  mcp-server/           # MCP tool registration and local stdio
  meta-facebook/        # Page and business assets
  meta-marketing/       # ads, insights, leads
  meta-messenger/       # Page messaging diagnostics
  meta-instagram/       # professional account capabilities
  meta-whatsapp/        # Cloud API/WABA
  meta-threads/         # Threads API
  meta-webhooks/        # signatures, challenge, fixtures
examples/
docs/
tests/
```
Treat this as a proposal; validate dependencies and maintainability in an ADR.

## Integration contract
Each adapter declares name, version, supported operations, required permissions, app review prerequisites, read/write risk, schema, failure modes and API version. Consumers feature-detect capabilities; unavailable integrations must degrade gracefully.

## Delivery evidence
Every milestone must include source, tests, docs, changelog and a list of verified vs blocked functionality. Live Meta access is opt-in only.
