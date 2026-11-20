# Claude / Cursor implementation handover

Repository: https://github.com/crismag/crishub-meta-mcp

You are the lead engineer implementing the independent public CRISHUB Meta MCP toolkit. First inspect the repository and read AGENTS.md, docs/DEVELOPMENT_MASTER_PLAN.md, docs/EXECUTION_BACKLOG.md, docs/API_TARGETS.md, docs/API_RESEARCH_LEDGER.md, docs/INTEGRATION_CONTRACTS.md, docs/SECURITY.md and docs/ROADMAP.md.

1. Reconcile documentation with actual code and issue #1; do not overwrite completed work.
2. Start Sprint 0 then Sprint 1; select maintained dependencies via ADR. Build a secure mock-first stdio MCP server with allowlisted, typed, read-only Meta tools.
3. Validate all Meta endpoint/permission claims against official documentation and record evidence in API_RESEARCH_LEDGER.md.
4. Add CI, deterministic fixtures, negative security tests, client configuration examples and setup docs.
5. Continue autonomously through safe coding, tests and documentation. Work in feature branches and submit reviewable PRs; do not merge or publish releases without approval.
6. Do not request or print live Meta credentials. Do not modify advertising, publish content, send messages, switch app mode or submit App Review.
7. Report exactly what works in mock mode, what is API-verified, what requires Meta credentials/permissions and what is blocked.

Architecture constraint: crishub-meta-platform is a separate private consumer/host; RealCRM is another independent consumer. No proprietary code or customer data belongs here.
