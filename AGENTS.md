# Agent development contract

Read README.md, docs/CONTEXT.md, docs/API_TARGETS.md, docs/ROADMAP.md and docs/SECURITY.md before changes.

1. Preserve independence from RealCRM and the private platform; never import proprietary modules.
2. Inspect repository and existing issues before writing; no speculative completion claims.
3. Prefer TypeScript, current maintained MCP SDK, Node LTS, typed schemas and tested modular adapters; record architectural decisions before committing to framework.
4. Phase 1 is read-only, local stdio and mock-first. No unbounded Graph API passthrough, sending messages, modifying ads, publishing content or changing accounts.
5. Verify endpoint, API version, permissions, access tier, webhook subscriptions and review requirements against official Meta docs; annotate verification date and URL.
6. Treat tokens and customer payloads as secrets; no real credentials in tests, screenshots, logs or commits. Validate all tool inputs and sanitize errors.
7. Include negative tests, pagination, retries, rate limits, token expiry, webhook signatures and cross-tenant isolation at boundaries.
8. Work in small PRs; update roadmap and documentation with VERIFIED/PLANNED/BLOCKED status. CI must run offline.
9. Use semver, capability discovery and compatibility contracts. Breaking changes require a migration note.
10. Do not enable live integration or request elevated permissions without explicit owner approval.
