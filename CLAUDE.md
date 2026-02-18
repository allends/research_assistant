# Research Assistant (`ra`)

CLI research assistant for Obsidian vaults. Uses the Claude Agent SDK with QMD (local hybrid search engine) to answer questions over a vault's markdown notes.

## Bun

Default to Bun instead of Node.js.

- `bun <file>` not `node <file>` or `ts-node <file>`
- `bun test` not `jest` or `vitest`
- `bun install` not `npm install`
- `bun run <script>` not `npm run <script>`
- `bunx <pkg>` not `npx <pkg>`
- Bun auto-loads `.env` — don't use dotenv
- Prefer `Bun.file` over `node:fs` readFile/writeFile

## Architecture

```
src/
  index.ts          — CLI entrypoint (commander)
  config.ts         — Config loading (~/.research-assistant/config.json), dev mode, vault path resolution
  agent/
    engine.ts       — askOnce() and chatLoop() via Agent SDK query()
    tools.ts        — MCP tool definitions (qmd_search, vault_read, vault_write, etc.)
    system-prompts.ts — System prompts for ask/chat modes
  commands/         — CLI command handlers (init, search, index, ask, chat)
  integrations/
    qmd.ts          — QMD subprocess wrapper (search, vsearch, embed, etc.)
    vault-fs.ts     — Direct vault filesystem access
    obsidian-cli.ts — Optional Obsidian CLI integration
  types/            — TypeScript types (config, vault, search)
  utils/            — Logger, markdown parser, formatter
tests/
  dev-smoke.ts      — Smoke tests for integrations
  cli-smoke.ts      — CLI end-to-end tests
```

## Key Constraints

- **QMD runs via `node`, not `bun`** — Bun's macOS SQLite uses Apple's system SQLite which lacks `loadExtension()`, breaking sqlite-vec for vector search. See `src/integrations/qmd.ts`.
- **Obsidian CLI is optional** — `obsidian_eval` tool gracefully returns a fallback message when unavailable.
- **Config location** — `~/.research-assistant/config.json`. In dev mode (`RA_DEV=1`), config is synthesized from defaults + `test-vault/`.

## Scripts

```sh
bun run ra <command>       # Dogfood the CLI (e.g. bun run ra search "query")
bun run test:smoke         # Integration smoke tests
bun run test:cli           # CLI end-to-end tests
bun run test:all           # All tests (smoke + cli)
```

## Dogfooding

Test against the local `test-vault/` using dev mode:

```sh
RA_DEV=1 bun run ra init
RA_DEV=1 bun run ra index
RA_DEV=1 bun run ra search "some topic"
RA_DEV=1 bun run ra ask "What notes discuss X?"
RA_DEV=1 bun run ra chat
```

Or point at any vault: `RA_VAULT=/path/to/vault bun run ra search "query"`

## Authentication

The agent requires one of:
- `ANTHROPIC_API_KEY` — direct API billing
- `CLAUDE_CODE_OAUTH_TOKEN` — Max subscription billing (obtain via `claude setup-token`)

## Agent SDK Patterns

- Tools are defined with `tool()` from `@anthropic-ai/claude-agent-sdk` using Zod schemas, then bundled into an MCP server via `createSdkMcpServer()`.
- The agentic loop uses `query()` which returns an async iterable of messages.
- Multi-turn chat uses `resume: sessionId` to continue a conversation.
- `permissionMode: "bypassPermissions"` requires `allowDangerouslySkipPermissions: true`.
- Tool names in `allowedTools` are prefixed: `mcp__<server>__<tool>` (e.g. `mcp__vault__qmd_search`).
