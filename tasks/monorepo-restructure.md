# Task: Restructure into a Bun monorepo

## Overview

Restructure the flat `src/` layout into a Bun workspace monorepo with four packages: `@ra/core`, `@ra/server`, `@ra/cli`, and `obsidian-research-assistant`. This decouples the engine from its clients and enables the Obsidian plugin to be a thin HTTP/SSE consumer.

See `docs/obsidian-plugin.md` for the full architecture plan.

## Why

- The Obsidian plugin can't sanely bundle the Agent SDK + QMD subprocess spawning in Electron's renderer process
- A server-based architecture lets any client (CLI, Obsidian, future web UI) consume the same API
- The core engine logic is currently tangled with CLI concerns (stdout writes, `process.exit`, readline)

## Target structure

```
research-assistant/
  package.json              — Workspace root (workspaces: ["packages/*"])
  bunfig.toml               — [workspace] packages = ["packages/*"]
  tsconfig.base.json        — Shared compiler options
  packages/
    core/
      package.json          — "@ra/core"
      tsconfig.json
      src/
        agent/
          engine.ts         — askStream(), chatStream() → AsyncGenerator<AgentEvent>
          tools.ts          — MCP tool definitions (unchanged)
          system-prompts.ts
          sub-agents.ts     — (if implemented)
        integrations/
          qmd.ts
          vault-fs.ts
          obsidian-cli.ts
        types/
          config.ts
          vault.ts
          search.ts
          api.ts            — Shared request/response types
        utils/
          logger.ts
          markdown.ts
          formatter.ts
        index.ts            — Barrel export
    server/
      package.json          — "@ra/server"
      tsconfig.json
      src/
        index.ts            — Server entrypoint (Bun.serve or Hono)
        routes/
          health.ts
          search.ts
          ask.ts
          chat.ts
          link-suggest.ts
          review.ts
          index-cmd.ts
          notes.ts
        middleware/
          auth.ts
          cors.ts
        sessions.ts         — In-memory chat session store
    cli/
      package.json          — "@ra/cli", bin: { ra: "./src/index.ts" }
      tsconfig.json
      src/
        index.ts            — Commander entrypoint
        config.ts           — Config loading (~/.research-assistant/)
        commands/
          init.ts
          search.ts
          index-cmd.ts
          ask.ts
          chat.ts
          link-suggest.ts
          review.ts
          list.ts
          serve.ts          — New: starts the server
    obsidian-plugin/
      package.json          — "obsidian-research-assistant"
      tsconfig.json
      manifest.json
      esbuild.config.mjs
      styles.css
      src/
        main.ts
        settings.ts
        client.ts           — HTTP/SSE client
        views/
          chat-view.ts
          results-modal.ts
        commands.ts
  tests/
    dev-smoke.ts            — Updated imports
    cli-smoke.ts
```

## Step-by-step plan

### Step 1: Create workspace root files

Create these files at the repo root:

**`package.json`** (replace current):
```json
{
  "name": "research-assistant",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "ra": "bun run packages/cli/src/index.ts --",
    "test:smoke": "bun run tests/dev-smoke.ts",
    "test:cli": "bun run tests/cli-smoke.ts",
    "test:all": "bun run test:smoke && bun run test:cli"
  }
}
```

**`bunfig.toml`**:
```toml
[workspace]
packages = ["packages/*"]
```

**`tsconfig.base.json`**:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

### Step 2: Create `@ra/core`

Create `packages/core/package.json`:
```json
{
  "name": "@ra/core",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.45",
    "@tobilu/qmd": "^1.0.6",
    "glob": "^11.0.0",
    "gray-matter": "^4.0.3",
    "zod": "^4.3.6"
  }
}
```

Create `packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

Move files:
```
src/agent/engine.ts         → packages/core/src/agent/engine.ts
src/agent/tools.ts          → packages/core/src/agent/tools.ts
src/agent/system-prompts.ts → packages/core/src/agent/system-prompts.ts
src/integrations/qmd.ts     → packages/core/src/integrations/qmd.ts
src/integrations/vault-fs.ts → packages/core/src/integrations/vault-fs.ts
src/integrations/obsidian-cli.ts → packages/core/src/integrations/obsidian-cli.ts
src/types/config.ts         → packages/core/src/types/config.ts
src/types/vault.ts          → packages/core/src/types/vault.ts
src/types/search.ts         → packages/core/src/types/search.ts
src/utils/logger.ts         → packages/core/src/utils/logger.ts
src/utils/markdown.ts       → packages/core/src/utils/markdown.ts
src/utils/formatter.ts      → packages/core/src/utils/formatter.ts
```

Create `packages/core/src/types/api.ts` — shared request/response types for server↔client communication.

Create `packages/core/src/index.ts` — barrel export of all public APIs.

### Step 3: Refactor the agent engine

This is the critical change. The current engine writes directly to stdout and calls `process.exit()`. It needs to become a pure data source.

**Current:**
```typescript
export async function askOnce(prompt, config, options): Promise<void> {
  // ...
  for await (const message of conversation) {
    writeAssistantContent(message);  // writes to stdout
  }
  process.exit(exitCode);  // kills the process
}
```

**Target:**
```typescript
export interface AgentEvent {
  type: "text" | "tool_start" | "tool_end" | "error" | "done";
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  sessionId?: string;
  error?: string;
}

export async function* askStream(
  prompt: string,
  config: Config,
  options?: { model?: string; maxTurns?: number; systemPrompt?: string },
): AsyncGenerator<AgentEvent> {
  checkAuth();
  const vaultMcpServer = createVaultMcpServer(config.vault.path);
  const conversation = query({ prompt, options: { /* ... */ } });

  for await (const message of conversation) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text") {
          yield { type: "text", text: block.text };
        }
        if (block.type === "tool_use") {
          yield { type: "tool_start", toolName: block.name, toolInput: block.input };
        }
      }
    }
    if (message.type === "result") {
      if (message.subtype === "success") {
        yield { type: "done", sessionId: message.session_id };
      } else {
        yield { type: "error", error: `${message.subtype}: ${message.errors?.join(", ") ?? ""}` };
      }
    }
  }
}

export async function* chatStream(
  prompt: string,
  config: Config,
  sessionId?: string,
  options?: { model?: string; maxTurns?: number },
): AsyncGenerator<AgentEvent> {
  // Same pattern but passes resume: sessionId
}
```

Key changes:
- Returns `AsyncGenerator<AgentEvent>` instead of writing to stdout
- No `process.exit()` — caller decides what to do
- No readline loop — the CLI reconstructs that, not the engine
- `checkAuth()` throws instead of calling `process.exit(1)`

### Step 4: Create `@ra/cli`

Create `packages/cli/package.json`:
```json
{
  "name": "@ra/cli",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "bin": {
    "ra": "./src/index.ts",
    "research-assistant": "./src/index.ts"
  },
  "dependencies": {
    "@ra/core": "workspace:*",
    "commander": "^12.0.0"
  }
}
```

Move files:
```
src/index.ts                → packages/cli/src/index.ts
src/config.ts               → packages/cli/src/config.ts
src/commands/init.ts        → packages/cli/src/commands/init.ts
src/commands/search.ts      → packages/cli/src/commands/search.ts
src/commands/index-cmd.ts   → packages/cli/src/commands/index-cmd.ts
src/commands/ask.ts         → packages/cli/src/commands/ask.ts
src/commands/chat.ts        → packages/cli/src/commands/chat.ts
src/commands/link-suggest.ts → packages/cli/src/commands/link-suggest.ts
src/commands/review.ts      → packages/cli/src/commands/review.ts
src/commands/list.ts        → packages/cli/src/commands/list.ts
```

Update all imports in CLI commands:
- `../agent/engine` → `@ra/core`
- `../integrations/qmd` → `@ra/core`
- `../integrations/vault-fs` → `@ra/core`
- `../types/*` → `@ra/core`
- `../utils/*` → `@ra/core`

Rewrite `ask.ts` and `chat.ts` to consume the async generators:

```typescript
// packages/cli/src/commands/ask.ts
import { askStream } from "@ra/core";

export async function askCommand(question: string, options: { model?: string; maxTurns?: string }) {
  const config = await loadConfig();
  let exitCode = 0;

  for await (const event of askStream(question, config, {
    model: options.model,
    maxTurns: options.maxTurns ? parseInt(options.maxTurns) : undefined,
  })) {
    if (event.type === "text") process.stdout.write(event.text!);
    if (event.type === "error") {
      console.error(`\nAgent stopped: ${event.error}`);
      exitCode = 1;
    }
  }

  process.stdout.write("\n");
  process.exit(exitCode);
}
```

Rewrite `chat.ts` to own the readline loop and consume `chatStream()`:

```typescript
// packages/cli/src/commands/chat.ts
import { chatStream } from "@ra/core";
import { createInterface } from "readline";

export async function chatCommand(options: { model?: string; context?: string }) {
  const config = await loadConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let sessionId: string | undefined;

  // ... readline loop ...
  for await (const event of chatStream(prompt, config, sessionId, { model: options.model })) {
    if (event.type === "text") process.stdout.write(event.text!);
    if (event.type === "done") sessionId = event.sessionId;
    if (event.type === "error") console.error(`\nAgent error: ${event.error}`);
  }
}
```

Add `ra serve` command (stub for now — implemented in Step 5):

```typescript
// packages/cli/src/commands/serve.ts
export async function serveCommand(options: { port?: number }) {
  const { startServer } = await import("@ra/server");
  const config = await loadConfig();
  await startServer(config, { port: options.port ?? 3117 });
}
```

### Step 5: Create `@ra/server`

Create `packages/server/package.json`:
```json
{
  "name": "@ra/server",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "@ra/core": "workspace:*",
    "hono": "^4.0.0"
  }
}
```

Build the server using Hono (lightweight, Bun-native):

**`packages/server/src/index.ts`:**
```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Config } from "@ra/core";
import { healthRoute } from "./routes/health.ts";
import { searchRoute } from "./routes/search.ts";
import { askRoute } from "./routes/ask.ts";
import { chatRoute } from "./routes/chat.ts";
import { notesRoute } from "./routes/notes.ts";
import { indexRoute } from "./routes/index-cmd.ts";
import { linkSuggestRoute } from "./routes/link-suggest.ts";
import { reviewRoute } from "./routes/review.ts";
import { authMiddleware } from "./middleware/auth.ts";

export async function startServer(config: Config, options: { port?: number }) {
  const app = new Hono();
  const port = options.port ?? 3117;
  const token = crypto.randomUUID();

  // Write token to ~/.research-assistant/server.json for clients to read
  await Bun.write(
    `${process.env.HOME}/.research-assistant/server.json`,
    JSON.stringify({ port, token, pid: process.pid }, null, 2)
  );

  app.use("*", cors({ origin: ["app://obsidian.md", "http://localhost:*"] }));
  app.use("*", authMiddleware(token));

  healthRoute(app, config);
  searchRoute(app, config);
  askRoute(app, config);
  chatRoute(app, config);
  notesRoute(app, config);
  indexRoute(app, config);
  linkSuggestRoute(app, config);
  reviewRoute(app, config);

  console.log(`Research Assistant server running on http://localhost:${port}`);
  console.log(`Auth token: ${token}`);

  Bun.serve({ fetch: app.fetch, port });
}
```

**SSE streaming pattern** (used by ask, chat, link-suggest, review routes):
```typescript
// packages/server/src/routes/ask.ts
import { askStream } from "@ra/core";

export function askRoute(app: Hono, config: Config) {
  app.post("/ask", async (c) => {
    const { prompt, model, maxTurns } = await c.req.json();

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for await (const event of askStream(prompt, config, { model, maxTurns })) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
    );
  });
}
```

**Auth middleware:**
```typescript
// packages/server/src/middleware/auth.ts
export function authMiddleware(validToken: string) {
  return async (c, next) => {
    if (c.req.path === "/health") return next(); // health is public
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token !== validToken) return c.json({ error: "Unauthorized" }, 401);
    return next();
  };
}
```

**Chat sessions:**
```typescript
// packages/server/src/sessions.ts
const sessions = new Map<string, string>(); // clientSessionId → agentSessionId

export function getSession(id: string): string | undefined {
  return sessions.get(id);
}

export function setSession(id: string, agentSessionId: string): void {
  sessions.set(id, agentSessionId);
}
```

### Step 6: Delete old `src/` directory

After verifying everything works:
```sh
rm -rf src/
```

The root `package.json` scripts now point to `packages/cli/src/index.ts`.

### Step 7: Update tests

Update `tests/dev-smoke.ts` and `tests/cli-smoke.ts` imports to reference `@ra/core` or the new CLI paths.

### Step 8: Update CLAUDE.md

Update the Architecture section, scripts, and file paths to reflect the monorepo structure.

## Verification checklist

After each step, verify nothing is broken:

- [ ] `bun install` succeeds at the workspace root
- [ ] `bun run ra search "test query"` works (CLI → core)
- [ ] `bun run ra ask "test question"` works (CLI → core)
- [ ] `bun run ra chat` starts the interactive loop
- [ ] `bun run ra serve` starts the server on :3117
- [ ] `curl http://localhost:3117/health` returns status
- [ ] `curl -H "Authorization: Bearer <token>" -X POST http://localhost:3117/search -d '{"query":"test"}'` returns results
- [ ] SSE streaming works: `curl -N -H "Authorization: Bearer <token>" -X POST http://localhost:3117/ask -d '{"prompt":"What notes do I have?"}'`
- [ ] `bun run test:smoke` passes
- [ ] `bun run test:cli` passes

## Files to create

- `package.json` (rewrite root)
- `bunfig.toml`
- `tsconfig.base.json`
- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/src/index.ts`
- `packages/core/src/types/api.ts`
- `packages/server/package.json`
- `packages/server/tsconfig.json`
- `packages/server/src/index.ts`
- `packages/server/src/routes/*.ts` (8 route files)
- `packages/server/src/middleware/auth.ts`
- `packages/server/src/middleware/cors.ts`
- `packages/server/src/sessions.ts`
- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/commands/serve.ts`

## Files to move

- `src/agent/*` → `packages/core/src/agent/`
- `src/integrations/*` → `packages/core/src/integrations/`
- `src/types/*` → `packages/core/src/types/`
- `src/utils/*` → `packages/core/src/utils/`
- `src/index.ts` → `packages/cli/src/index.ts`
- `src/config.ts` → `packages/cli/src/config.ts`
- `src/commands/*` → `packages/cli/src/commands/`

## Files to modify

- `packages/core/src/agent/engine.ts` — rewrite to async generators (biggest change)
- `packages/cli/src/commands/ask.ts` — consume generator instead of calling askOnce
- `packages/cli/src/commands/chat.ts` — consume generator, own the readline loop
- `packages/cli/src/commands/link-suggest.ts` — update imports
- `packages/cli/src/commands/review.ts` — update imports
- `packages/cli/src/commands/search.ts` — update imports
- `packages/cli/src/commands/init.ts` — update imports
- `packages/cli/src/commands/index-cmd.ts` — update imports
- `packages/cli/src/commands/list.ts` — update imports
- `packages/cli/src/index.ts` — update import paths
- `packages/cli/src/config.ts` — import types from @ra/core
- `tests/dev-smoke.ts` — update imports
- `tests/cli-smoke.ts` — update imports
- `CLAUDE.md` — update architecture docs

## Order of operations

1. Create workspace root files (`package.json`, `bunfig.toml`, `tsconfig.base.json`)
2. Create `packages/core/` and move files — verify `bun install` works
3. Refactor engine to async generators — this is the riskiest change
4. Create `packages/cli/` and move files — verify `bun run ra` works
5. Delete old `src/` — point of no return, do this only after CLI works
6. Create `packages/server/` — new code, no migration risk
7. Add `ra serve` to CLI
8. Update tests and CLAUDE.md
9. Run full verification checklist

## Risks

- **Agent SDK message types** — The engine refactor depends on knowing the exact shape of messages yielded by `query()`. The current code already handles these, so the shapes are known, but the `tool_use` and `tool_result` message structures should be verified against the SDK types.
- **QMD path resolution** — QMD resolves its entry point via `import.meta.dir`. After moving to `packages/core/`, verify the path still resolves correctly.
- **Bun workspace linking** — `workspace:*` dependencies should resolve via Bun's workspace protocol. Test that `@ra/core` is importable from `@ra/cli` and `@ra/server` without a build step.
- **`process.exit` removal** — The engine currently calls `process.exit()` to force-kill dangling MCP handles. After removing it, the CLI commands need to handle cleanup or call `process.exit()` themselves.
