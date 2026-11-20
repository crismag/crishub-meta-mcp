# Claude Code

Register the local stdio server (mock mode) for the current project:

```sh
claude mcp add crishub-meta --env META_MODE=mock -- node /ABSOLUTE/PATH/TO/crishub-meta-mcp/packages/mcp-server/dist/bin.js
```

For live read-only use, do **not** put a token on the command line (it ends up in shell history and
`.claude.json`). Export it in the environment that launches Claude Code instead:

```sh
export META_MODE=live
export META_ACCESS_TOKEN=...   # from a secret manager, never pasted into chat
claude mcp add crishub-meta --env META_MODE=live -- node /ABSOLUTE/PATH/TO/.../dist/bin.js
```
