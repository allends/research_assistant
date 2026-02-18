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

Bun workspace monorepo with three packages:

```
packages/
  core/                   — @ra/core: engine, integrations, types, utils
    src/
      agent/
        engine.ts         — askStream() and chatStream() → AsyncGenerator<AgentEvent>
        tools.ts          — MCP tool definitions (qmd_search, vault_read, vault_write, etc.)
        system-prompts.ts — System prompts for ask/chat/link-suggest/review modes
      integrations/
        qmd.ts            — QMD subprocess wrapper (search, vsearch, embed, etc.)
        vault-fs.ts       — Direct vault filesystem access
        obsidian-cli.ts   — Optional Obsidian CLI integration
      types/
        config.ts         — Config interface & defaults
        search.ts         — Search result types
        vault.ts          — Note, frontmatter, vault stats types
        api.ts            — Shared request/response types for server↔client
      utils/
        logger.ts         — Color logging with verbose mode
        markdown.ts       — Wikilink, tag, heading extraction
        formatter.ts      — Terminal formatting for search results
      index.ts            — Barrel export
  cli/                    — @ra/cli: Commander-based CLI
    src/
      index.ts            — CLI entrypoint (commander)
      config.ts           — Config loading (~/.research-assistant/), dev mode
      commands/           — CLI command handlers (init, search, index, ask, chat, link-suggest, review, list, serve)
  server/                 — @ra/server: Hono HTTP server with SSE streaming
    src/
      index.ts            — Server entrypoint (Bun.serve + Hono)
      routes/             — health, search, ask, chat, notes, index, link-suggest, review
      middleware/         — auth (bearer token), cors
      sessions.ts         — In-memory chat session store
tests/
  dev-smoke.ts            — Smoke tests for integrations
  cli-smoke.ts            — CLI end-to-end tests
```

## Key Constraints

- **QMD runs via `node`, not `bun`** — Bun's macOS SQLite uses Apple's system SQLite which lacks `loadExtension()`, breaking sqlite-vec for vector search. See `packages/core/src/integrations/qmd.ts`.
- **Obsidian CLI is optional** — `obsidian_eval` tool gracefully returns a fallback message when unavailable.
- **Config location** — `~/.research-assistant/config.json`. In dev mode (`RA_DEV=1`), config is synthesized from defaults + `test-vault/`.
- **Engine is a pure data source** — `askStream()` and `chatStream()` return `AsyncGenerator<AgentEvent>`. No `process.exit()`, no stdout writes, no readline. CLI commands consume the generators and handle I/O.
- **Workspace packages** — `@ra/core` is imported by `@ra/cli` and `@ra/server` via `workspace:*` protocol. No build step needed — Bun resolves `.ts` directly.

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
RA_DEV=1 bun run ra serve
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

## Server

The `@ra/server` package exposes an HTTP API with SSE streaming:

- `GET /health` — public health check
- `POST /search` — hybrid search (JSON response)
- `POST /ask` — single-turn agent query (SSE stream of `AgentEvent`)
- `POST /chat` — multi-turn chat (SSE stream, session management)
- `GET /notes` — list vault notes
- `GET /notes/:path` — read a specific note
- `POST /index` — trigger re-indexing
- `GET /index/status` — index status
- `POST /link-suggest` — semantic link suggestions (SSE stream)
- `POST /review` — vault review (SSE stream)

Auth: Bearer token generated at startup, written to `~/.research-assistant/server.json`.
