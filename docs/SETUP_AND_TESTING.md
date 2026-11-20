# Development setup and testing

Every command below was run on 2026-11-20 against this branch (Node 22.23, pnpm 10.28) and passed.

## Prerequisites

- Node.js 22.12+ (see `.nvmrc`); CI also runs Node 24.
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`).

## Install, build and verify

```sh
pnpm install --frozen-lockfile
pnpm build            # tsc -b across all packages
pnpm lint
pnpm format:check
pnpm test             # Vitest, fully offline (mock Graph transport)
pnpm test:coverage
pnpm smoke            # spawns the built stdio server and calls tools via a real MCP client
pnpm example:sdk      # programmatic use without MCP
node scripts/check-secrets.mjs
pnpm check            # format + lint + typecheck + test + smoke
```

No Meta credentials, network access or paid services are needed for any of these.

## Run the MCP server locally (mock mode)

```sh
pnpm build
META_MODE=mock node packages/mcp-server/dist/bin.js
```

The server speaks MCP over stdio; logs are JSON lines on stderr and are redacted.
Client configuration examples (placeholders only):

- Claude Desktop: [`examples/claude-desktop/claude_desktop_config.json`](../examples/claude-desktop/claude_desktop_config.json)
- Cursor: [`examples/cursor/mcp.json`](../examples/cursor/mcp.json) (project `.cursor/mcp.json` or global `~/.cursor/mcp.json`)
- Claude Code: [`examples/claude-code/README.md`](../examples/claude-code/README.md)

Replace `/ABSOLUTE/PATH/TO/` with your checkout path. Never commit a client config that contains a token;
`.gitignore` excludes `mcp.json` and `claude_desktop_config.json` outside `examples/`.

Try first: `meta_connection_status`, then `meta_capabilities_list`, then `meta_pages_list`.

### Mock scenarios

`META_MOCK_SCENARIO` simulates Meta behaviour for demos and tests:
`default`, `expired_token` (190/463), `rate_limited` (80004 + BUC header), `permission_denied` (200),
`review_required` (10, App Review), `upstream_flaky` (alternating transient 500s, recovered by retry),
`malformed_response` (schema mismatch, fails closed).

## Configuration

See [`.env.example`](../.env.example). All configuration comes from the server environment, never from tool
arguments.

| Variable                                                                            | Default              | Meaning                                                                             |
| ----------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `META_MODE`                                                                         | `mock`               | `mock` (fixtures) or `live` (real Graph API, read-only)                             |
| `META_ACCESS_TOKEN`                                                                 | —                    | Live mode user/system-user token. Provide via a secret manager; never paste in chat |
| `META_TOKEN_TYPE`                                                                   | —                    | `user` or `system_user` (informational)                                             |
| `META_APP_ID`, `META_APP_SECRET`                                                    | —                    | Enables `appsecret_proof` and app-token `debug_token`                               |
| `META_GRAPH_VERSION`                                                                | `v26.0`              | `v25.0` or `v26.0`                                                                  |
| `META_ADAPTERS`                                                                     | `facebook,marketing` | Enabled adapters                                                                    |
| `META_ALLOWED_PAGE_IDS`, `META_ALLOWED_AD_ACCOUNT_IDS`, `META_ALLOWED_BUSINESS_IDS` | —                    | Optional server-side asset allowlists                                               |
| `META_ENABLE_UNVERIFIED_TOOLS`                                                      | `false`              | Registers experimental tools whose endpoints are not documentation-verified         |
| `META_TIMEOUT_MS`                                                                   | `10000`              | Per-attempt timeout (500–60000)                                                     |
| `META_LOG_LEVEL`                                                                    | `info`               | `debug`, `info`, `warn`, `error`, `silent`                                          |

## Live mode (opt-in, owner approval required)

Live mode has **not** been exercised against Meta by this project yet. Before trying it: get owner approval, use a
test Meta app and assets you own, grant only the read permissions in `docs/API_RESEARCH_LEDGER.md`, and supply the
token through the environment of the process that launches the MCP client. A successful mock run says nothing about
Meta login, App Review, Tech Provider status or live permissions.

## CI gates (`.github/workflows/ci.yml`)

- Node 22 and 24: frozen-lockfile install, format, lint, typecheck, tests with coverage, stdio smoke test, SDK
  example, offline secret pattern scan
- Security job: `pnpm audit --prod --audit-level high`, gitleaks (config: `.gitleaks.toml`)
- Pull requests: GitHub dependency review (fails on high severity)

## What the tests cover

Redaction and `SecretToken` serialisation; Graph error mapping (190/102/4/17/32/613/80004/10/200/2635/100/1/2/5xx);
endpoint allowlist registration rules; path/host/field/query/cursor injection; fixed host and version;
`appsecret_proof`; schema fail-closed and unknown-key stripping; size caps; non-JSON bodies; bounded retries with
backoff and no retry on rate limit/token/permission errors; timeouts; pagination budgets, non-advancing cursors and
never following `paging.next`; internal Page-token resolution and caching; asset allowlists; strict tool input;
output schema enforcement; every tool through a real MCP client (in-memory) and over stdio; a security sweep running
every network tool in every mock scenario asserting no token/secret appears in any response.
