# Development setup and testing plan

This repository currently contains planning documents. Commands below are targets, **not verified working commands**.

## Intended local workflow
1. Install a supported Node LTS version and the package manager selected by ADR.
2. Install workspace dependencies.
3. Run format/lint/typecheck/unit tests in offline mode.
4. Start the MCP server with a mock credential provider and deterministic fixtures.
5. Configure a compatible MCP client using the documented stdio command and placeholder variables.
6. Confirm tool discovery and invoke a harmless mock Page list operation.
7. For live testing, obtain explicit owner approval and use a test Meta app and authorized test assets; provide credentials only through a local secure secret provider.

## CI gates
- Fresh checkout and lockfile reproducibility
- Typecheck, lint, format, unit and contract tests
- Secret scanning and dependency audit
- Mocked API permission errors, pagination/rate-limit cases and malformed responses
- Webhook signature verification positive and negative cases
- Tool allowlist enforcement and redaction tests

## Evidence and status
Every PR must include test commands actually executed, results, changed API capabilities, documentation updates and limitations. Never claim successful Meta login, Tech Provider registration or live app permissions based solely on mock tests.
