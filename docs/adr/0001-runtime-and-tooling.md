# ADR 0001: Runtime, package manager, MCP SDK and tooling

- Status: Accepted (pending owner review in the Sprint 0–1 PR)
- Date: 2026-11-20

## Context

Sprint 0 requires a reproducible, offline-testable workspace for an MCP server and independently
installable Meta adapters (AGENTS.md rule 3: TypeScript, maintained MCP SDK, Node LTS, typed schemas).

## Decision

| Concern         | Choice                                                | Version (2026-11-20)       | Rationale                                                                                                                                                                         |
| --------------- | ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js LTS                                           | `>=22.12` (CI: 22 and 24)  | Active LTS lines; native `fetch`, `AbortSignal.timeout`.                                                                                                                          |
| Language        | TypeScript, strict, ESM (`NodeNext`)                  | `~6.0.3`                   | Latest line supported by `typescript-eslint` (`<6.1`). TypeScript 7 (native) is not yet supported by the lint toolchain; revisit then.                                            |
| Package manager | pnpm workspaces, pinned via `packageManager`          | `10.28.0`                  | Strict dependency isolation (adapters cannot use undeclared deps), fast frozen-lockfile installs.                                                                                 |
| MCP SDK         | `@modelcontextprotocol/sdk` (official TypeScript SDK) | `^1.32.2`                  | Maintained reference implementation; `McpServer.registerTool` with input/output schemas, stdio and in-memory transports.                                                          |
| Schemas         | `zod`                                                 | `^4.6.7`                   | Peer of the MCP SDK (`^3.25 \|\| ^4`); one schema yields runtime validation, TS types and advertised JSON Schema.                                                                 |
| Transport       | stdio only                                            | —                          | Local-first per SECURITY.md. Remote/HTTP transport deferred until an authenticated transport and threat model are approved.                                                       |
| Tests           | Vitest                                                | `^5.1.1`                   | Fast, ESM-native, built-in coverage (v8).                                                                                                                                         |
| Lint / format   | ESLint flat config + `typescript-eslint`, Prettier    | `^10.15`, `^8.73`, `^3.10` | Standard, maintained.                                                                                                                                                             |
| Build           | `tsc -b` project references                           | —                          | No bundler needed for a Node library/CLI; emits `.d.ts` for SDK consumers.                                                                                                        |
| CI              | GitHub Actions                                        | —                          | Format, lint, typecheck, tests + coverage, stdio smoke test, example run, offline secret pattern scan, gitleaks, `pnpm audit`, dependency review. No Meta credentials or network. |

### Workspace layout

```text
packages/core            @crishub-meta-mcp/core       errors, redaction, credentials, context, capability registry,
                                                       adapter + tool contracts, allowlisted Graph client, mock Graph, diagnostics tools
packages/meta-facebook   @crishub-meta-mcp/facebook   businesses, Pages
packages/meta-marketing  @crishub-meta-mcp/marketing  ad accounts, campaigns, insights, lead forms
packages/mcp-server      @crishub-meta-mcp/server     config, runtime wiring, MCP registration, `crishub-meta-mcp` stdio bin
```

Further adapters (messenger, instagram, whatsapp, threads, webhooks) are added as sibling packages in later sprints.

### Packaging and releases

All packages are `private: true` and versioned `0.1.0-dev`. Nothing is published until the owner chooses a license
(README "Licensing") and approves release automation (Sprint 5). Semver applies from the first tagged release.

## Consequences

- Contributors need Node 22+ and Corepack/pnpm 10.
- TypeScript 7 adoption is blocked on lint-tool support; tracked for a later ADR.
- Packages depend on each other via `workspace:*`; tests resolve sources directly through Vitest aliases.
