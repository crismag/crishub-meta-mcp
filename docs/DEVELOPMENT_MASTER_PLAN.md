# CRISHUB Meta MCP — master development context
Version: planning baseline 2026-11-20. Status: proposed, not implemented.

## 1. Mission and ownership
Build a public, reusable MCP server and typed Meta API integration SDK, usable from Claude, Cursor, other MCP clients and conventional applications. It must not require RealCRM or the private CRISHUB Meta Platform. It must not masquerade as an official Meta integration.

**Public repo owns:** MCP transport, typed adapters, API schemas, generic credential interfaces, diagnostics, webhook verification helpers, mock fixtures, examples and documentation.
**Private crishub-meta-platform owns:** hosted auth, tenant registry, secret vault, subscription management, webhook delivery, AI orchestration, billing and audit persistence.
**Private realstate_crm_saas owns:** CRM data model, UI, lead pipelines, task automation, customer workflows and optional Meta plugin.
Use versioned contracts. Never copy private source or customer data to this public repository.

## 2. Development principles
- API-first, capability-aware, modular, least privilege, mock-first, test-first.
- Read-only default; no generic arbitrary Graph API proxy available to an agent.
- Each adapter independently installable; disabling one does not break others.
- Credential provider abstraction, no hardcoded tokens or IDs, no token disclosure in MCP outputs.
- Support app versioning, endpoint-specific permissions, rate limits and Meta API deprecations.
- No assumption that Meta Developer Dashboard actions can be performed via Graph API.
- All API features must carry a source URL and last-verified date before marked supported.
- No paid infrastructure required for unit tests or local mock demo.
- Stable error model, structured logging with redaction, observable requests without PII.

## 3. Architecture and boundaries
```text
MCP clients (Claude, Cursor, other clients)   Application SDK consumers
                 |                                      |
           MCP server / tool catalog                 typed SDK
                 |                                      |
             authorization policy / capability registry
                               |
           Graph transport / credential provider / limits
                               |
        independent adapters (Pages, Ads, Leads, Messenger,
          Instagram, WhatsApp, Threads, Webhooks)
                               |
                       Meta official APIs
```
Proposed workspace: packages/core, mcp-server, facebook, marketing, leads, messenger, instagram, whatsapp, threads, webhooks; examples/ and tests/. Validate in ADR. Prefer TypeScript/Node LTS and maintained MCP SDK, but confirm dependencies before scaffolding.

## 4. Public tool catalog (candidate, names not final)
- meta.connection_status: safe configured/missing/expired/permission-gated summary
- meta.token_permissions: permitted scopes/expiry metadata only; never token values
- meta.businesses.list, meta.pages.list, meta.pages.get
- meta.ad_accounts.list, meta.campaigns.list, meta.insights.query (bounded)
- meta.lead_forms.list, meta.leads.list (sensitive; optional disabled by default)
- meta.instagram.accounts.list, meta.instagram.insights.query
- meta.whatsapp.accounts.list, meta.whatsapp.templates.list
- meta.messenger.capabilities, meta.webhooks.subscription_status where supported
- meta.threads.capabilities
- meta.config.audit: evidence-backed local readiness checklist
No tool should assert an endpoint is supported without verified API access and permissions. For all tools: JSON schema, allowlisted fields, pagination bounds, error codes, sensitivity level, scope and risk classification.

## 5. API families and rollout
**Foundation:** Graph API, Page/business assets, app/token diagnostics, Facebook Login for Business integration documentation, webhook basics.
**Marketing:** ad accounts, campaigns, ad sets, ads, insights, Lead Ads forms and leads.
**Communications:** Messenger, Instagram professional account messaging/insights, WhatsApp Cloud API assets/templates/webhooks.
**Extended:** Threads, Pages publishing and content moderation, advanced analytics and approved write actions.
App Review, Tech Provider onboarding, business verification, permissions and use cases are external prerequisites and are not automatically granted by selecting a use case.

## 6. Auth and security
CredentialProvider interface returns tokens only to transport internally. Never include raw tokens in tool output, exception, test snapshots or logs. Support user/Page/system-user tokens only when permitted for each endpoint. Explicit per-operation token-type and permission checks; never silently escalate. Bound asset IDs to authorized connection context. No arbitrary hostnames, SSRF, or redirects to untrusted domains. HTTP retries only for safe idempotent requests with bounded exponential backoff. Use short timeouts, rate-limit handling and request budgets. For sensitive lead/message payloads, minimize and mask fields in diagnostic tools.

## 7. Webhook contract
Implement challenge verification, X-Hub-Signature-256 verification over exact raw bytes, constant-time digest comparison, payload validation, event normalization and fixture-driven tests. Library can expose event IDs and dedupe hooks; durable queue, replay ledger, retries and tenant routing belong to private platform. Do not infer successful webhook delivery from a local fixture.

## 8. MCP client integration
Ship stdio setup examples for Claude Desktop and Cursor with placeholder environment variables. Confirm client-specific configuration against current official client docs before publishing. Never commit actual mcp.json with credentials. Remote MCP server deployment is deferred until authenticated transport and threat model are approved.

## 9. API verification ledger
Maintain docs/API_RESEARCH_LEDGER.md with one entry per endpoint: official docs URL, date, Graph version, path/method, permission, token type, access tier, review prerequisite, app/business requirements, data sensitivity, request schema, sample sanitized response, pagination, error modes and status UNVERIFIED/VERIFIED/BLOCKED/DEPRECATED.

## 10. Engineering and release
R0 foundation -> R1 read-only MCP -> R2 Lead Ads and webhook utilities -> R3 messaging/Instagram/WhatsApp/Threads diagnostics -> R4 gated write tools -> R5 v1.0 stabilization. Every phase requires offline CI, unit tests, mocked contract tests, security negatives, README/how-to, changelog and explicit exit evidence. Semver and capability registry must isolate API version differences. Live tests require explicit opt-in and owned test assets.

## 11. Handover to agents
Read AGENTS.md, README.md, docs/CONTEXT.md, docs/API_TARGETS.md, docs/ROADMAP.md, docs/SECURITY.md, this document and docs/EXECUTION_BACKLOG.md. Inspect current code and issues before implementation. Update docs as code evolves. Open small PRs. Never mark a feature implemented merely because it is documented.
