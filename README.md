# CRISHUB Meta MCP Toolkit

Open-source, vendor-neutral Model Context Protocol (MCP) tools and typed API adapters for the Meta ecosystem.

> **Status: v0.1.0-dev, read-only MVP in mock mode.** A local stdio MCP server with 9 read-only tools (plus 2 experimental) runs and passes offline tests against a deterministic mock Graph API. **Live Meta access has not been exercised yet.** This is an independent community-facing developer toolkit, not an official Meta product.

## Purpose

Enable AI development assistants and applications to safely inspect, test, and integrate authorized Meta resources. Designed for Claude, Cursor, and any compatible MCP client. RealCRM is an optional consumer, never a required dependency.

## Planned integrations

- Facebook Login for Business and permission diagnostics (where applicable)
- Graph API: businesses, Pages, assets, permissions and account inspection
- Marketing API: ad accounts, campaigns, insights, lead forms and authorized lead retrieval
- Facebook Lead Ads: form discovery, lead retrieval and webhook validation
- Messenger Platform: Page messaging permissions, webhook diagnostics, approved messaging operations in later phases
- Instagram API: professional accounts, media, comments, insights and messaging where eligible
- WhatsApp Business Platform / Cloud API: WABA assets, templates, webhooks and messaging diagnostics
- Threads API: authorization, publishing and insights where supported
- Webhooks: challenge verification, signature validation, replay protection and event fixtures
- App configuration: capability audit, documentation and dashboard-only manual checklists

All endpoints, permissions, rate limits and app-review requirements must be verified against current official Meta documentation before implementation. No assumption that every capability is available for every app.

## Architecture

A small MCP transport layer calls allowlisted tools backed by independent typed Meta API adapters. Authentication, rate limiting, retries, pagination, schema validation and structured errors are shared libraries. Do not expose a general arbitrary-URL Graph API proxy to AI agents.

## Safety by default

Read-only, local stdio, mock fixtures, least privilege, secrets never logged, no tokens returned to models, no production messaging or ad-spend mutations. Tenant and app boundaries are enforced by the consuming application, never inferred from user-supplied IDs.

## Getting started

Development has not started. See [development context](docs/CONTEXT.md), [API coverage](docs/API_TARGETS.md), [roadmap](docs/ROADMAP.md), and [agent rules](AGENTS.md).

## Ecosystem

- [Private managed platform](https://github.com/crismag/crishub-meta-platform) — commercial hosting, tenant routing and automation (access restricted)
- [RealCRM](https://github.com/crismag/realstate_crm_saas) — independent downstream CRM consumer

## Licensing

**License decision pending.** Apache-2.0 is proposed, subject to owner approval. Do not add a license or claim open-source licensing rights until the owner chooses one. Public source visibility alone does not grant redistribution rights.

## Disclaimer

Not affiliated with or endorsed by Meta. Use only authorized accounts and follow Meta platform policies and applicable privacy law.
