# Research Assistant — Monorepo Plan

Restructure the research assistant into a monorepo with a shared core, an HTTP server, the existing CLI, and a thin Obsidian plugin client.

## Why Monorepo + Client/Server

The original plan bundled everything (Agent SDK, QMD, subprocess spawning) into the Obsidian plugin's renderer process. Problems with that:

- **QMD needs Node subprocesses** — fragile from Electron's renderer
- **Agent SDK is heavy** — bloats the plugin bundle
- **Single client lock-in** — rebuilding for every new client (web UI, VS Code, Alfred)
- **process.env hacks** — credential injection in the renderer is unreliable

Instead: a local server owns all the heavy lifting. Clients are thin HTTP/SSE consumers. The Obsidian plugin becomes ~500 lines of UI code with zero backend dependencies.

## Monorepo Structure

```
research-assistant/
  packages/
    core/                     — Shared engine (agent, tools, QMD, vault-fs, types)
      src/
        agent/
          engine.ts           — askOnce(), chatSession() returning async iterables
          tools.ts            — MCP tool definitions (unchanged)
          system-prompts.ts   — System prompts
        integrations/
          qmd.ts              — QMD subprocess wrapper
          vault-fs.ts         — Direct filesystem vault access
          obsidian-cli.ts     — Optional Obsidian CLI
        types/
          config.ts
          vault.ts
          search.ts
          api.ts              — Shared request/response types for server↔client
        utils/
          logger.ts
          markdown.ts
          formatter.ts
        index.ts              — Public API barrel export
      package.json            — "name": "@ra/core"

    server/                   — HTTP/SSE server wrapping core
      src/
        index.ts              — Server entrypoint (Bun.serve or Hono)
        routes/
          search.ts           — POST /search
          ask.ts              — POST /ask (SSE stream)
          chat.ts             — POST /chat, POST /chat/:sessionId (SSE stream)
          link-suggest.ts     — POST /link-suggest (SSE stream)
          review.ts           — POST /review (SSE stream)
          index-cmd.ts        — POST /index
          notes.ts            — GET /notes, GET /notes/:path, PUT /notes/:path
          health.ts           — GET /health
        middleware/
          auth.ts             — Bearer token validation
          cors.ts             — CORS for local clients
        sessions.ts           — Chat session store (sessionId → state)
      package.json            — "name": "@ra/server"

    cli/                      — CLI client (existing commands, imports from core)
      src/
        index.ts              — Commander entrypoint
        commands/              — init, search, ask, chat, etc.
        config.ts             — Config loading
      package.json            — "name": "@ra/cli", "bin": { "ra": "./src/index.ts" }

    obsidian-plugin/          — Thin Obsidian plugin (HTTP client + UI)
      src/
        main.ts               — Plugin lifecycle
        settings.ts           — Settings tab (server URL, model prefs)
        client.ts             — HTTP/SSE client to @ra/server
        views/
          chat-view.ts        — Right-panel chat (ItemView)
          results-modal.ts    — Search results modal
        commands.ts           — Command palette registrations
      styles.css
      manifest.json
      package.json            — "name": "obsidian-research-assistant"
      esbuild.config.mjs

  package.json                — Workspace root
  bunfig.toml                 — Bun workspace config
  tsconfig.base.json          — Shared TS config
```

## Workspace Configuration

Root `package.json`:
```json
{
  "name": "research-assistant",
  "private": true,
  "workspaces": ["packages/*"]
}
```

Root `bunfig.toml`:
```toml
[workspace]
packages = ["packages/*"]
```

Shared `tsconfig.base.json`:
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
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

Each package extends: `{ "extends": "../../tsconfig.base.json" }`

## Package Details

### `@ra/core` — The Engine

Everything currently in `src/agent/`, `src/integrations/`, `src/types/`, `src/utils/` moves here. The key change: the agent engine returns structured data instead of writing to stdout.

```typescript
// packages/core/src/agent/engine.ts

export interface AgentEvent {
  type: "text" | "tool_start" | "tool_end" | "error" | "done";
  text?: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  sessionId?: string;
  error?: string;
}

/** Single-turn ask — yields streaming events */
export async function* askStream(
  prompt: string,
  config: Config,
  options?: { model?: string; maxTurns?: number; systemPrompt?: string },
): AsyncGenerator<AgentEvent> {
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
    if (message.type === "tool_result") {
      yield { type: "tool_end", toolName: message.tool_name, toolResult: message.result };
    }
    if (message.type === "result") {
      if (message.subtype === "success") {
        yield { type: "done", sessionId: message.session_id };
      } else {
        yield { type: "error", error: message.subtype };
      }
    }
  }
}

/** Multi-turn chat — yields streaming events, accepts sessionId for resume */
export async function* chatStream(
  prompt: string,
  config: Config,
  sessionId?: string,
  options?: { model?: string; maxTurns?: number },
): AsyncGenerator<AgentEvent> {
  // Same as askStream but passes resume: sessionId
}
```

Public API (`packages/core/src/index.ts`):
```typescript
export { askStream, chatStream } from "./agent/engine.ts";
export type { AgentEvent } from "./agent/engine.ts";
export { hybridSearch, get as qmdGet, embed, indexAll } from "./integrations/qmd.ts";
export { listNotes, readNote, writeNote } from "./integrations/vault-fs.ts";
export type { Config } from "./types/config.ts";
export type { SearchResult } from "./types/search.ts";
export type * from "./types/api.ts";
```

### `@ra/server` — HTTP/SSE API

Lightweight server using `Bun.serve` (or Hono for routing). Streams agent responses as Server-Sent Events.

#### Authentication

The server holds Claude credentials (loaded from env or config). Clients authenticate to the server with a local bearer token:

```typescript
// Server startup generates a random token, prints it, saves to ~/.research-assistant/server.json
const serverToken = crypto.randomUUID();

// Middleware checks Authorization header
function authMiddleware(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  return token === serverToken;
}
```

The Obsidian plugin reads the token from `~/.research-assistant/server.json` or the user pastes it into settings.

#### SSE Streaming

Agent responses stream as SSE events:

```typescript
// POST /ask
app.post("/ask", async (req) => {
  const { prompt, model, maxTurns } = await req.json();
  const config = await loadConfig();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const event of askStream(prompt, config, { model, maxTurns })) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
  );
});
```

#### Chat Sessions

The server manages multi-turn sessions in memory:

```typescript
// packages/server/src/sessions.ts
const sessions = new Map<string, { sessionId: string; config: Config }>();

// POST /chat — new session
// POST /chat/:sessionId — resume existing session
```

#### Full Route Table

| Route | Method | Body | Response | Description |
|---|---|---|---|---|
| `/health` | GET | — | `{ status, vault, indexed }` | Server status |
| `/search` | POST | `{ query, mode?, limit? }` | JSON array | Hybrid search |
| `/ask` | POST | `{ prompt, model?, maxTurns? }` | SSE stream | Single-turn agent |
| `/chat` | POST | `{ prompt, model?, maxTurns? }` | SSE stream | New chat session |
| `/chat/:id` | POST | `{ prompt }` | SSE stream | Resume chat |
| `/link-suggest` | POST | `{ file, apply? }` | SSE stream | Suggest wikilinks |
| `/review` | POST | `{ recentDays? }` | SSE stream | Review changes |
| `/index` | POST | `{ update? }` | JSON status | Trigger re-index |
| `/notes` | GET | `?folder=` | JSON array | List notes |
| `/notes/:path` | GET | — | JSON note | Read note |
| `/notes/:path` | PUT | `{ content }` | JSON status | Write note |

#### Server Startup

```sh
# New CLI command
ra serve                      # Start server on default port 3117
ra serve --port 3200          # Custom port
ra serve --daemon             # Background mode (writes PID file)
```

### `@ra/cli` — Command Line Client

Mostly unchanged. Imports from `@ra/core` instead of local paths. Gains one new command: `ra serve`.

The CLI continues to call core directly (no HTTP hop needed). It's a first-class client alongside the Obsidian plugin, not subordinate to the server.

```typescript
// packages/cli/src/commands/serve.ts
import { loadConfig } from "../config.ts";
import { startServer } from "@ra/server";

export async function serveCommand(options: { port?: number; daemon?: boolean }) {
  const config = await loadConfig();
  await startServer(config, { port: options.port ?? 3117 });
}
```

### `obsidian-research-assistant` — Obsidian Plugin

A thin client. No Agent SDK, no QMD, no Node subprocesses. Just HTTP calls and UI.

#### Settings

```typescript
interface RAPluginSettings {
  serverUrl: string;        // default: "http://localhost:3117"
  serverToken: string;      // bearer token for auth
  autoStartServer: boolean; // attempt to start server on plugin load (desktop only)
  model: string;            // passed to server in requests
  maxTurns: number;
  searchMode: "hybrid" | "keyword" | "semantic";
}
```

#### HTTP/SSE Client

```typescript
// packages/obsidian-plugin/src/client.ts

export class RAClient {
  constructor(private serverUrl: string, private token: string) {}

  private headers(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  async search(query: string, mode?: string, limit?: number): Promise<SearchResult[]> {
    const res = await fetch(`${this.serverUrl}/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ query, mode, limit }),
    });
    return res.json();
  }

  /** Returns an async iterable of AgentEvents from an SSE stream */
  async *ask(prompt: string, model?: string): AsyncGenerator<AgentEvent> {
    const res = await fetch(`${this.serverUrl}/ask`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ prompt, model }),
    });
    yield* this.readSSE(res);
  }

  async *chat(prompt: string, sessionId?: string): AsyncGenerator<AgentEvent> {
    const url = sessionId
      ? `${this.serverUrl}/chat/${sessionId}`
      : `${this.serverUrl}/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ prompt }),
    });
    yield* this.readSSE(res);
  }

  private async *readSSE(res: Response): AsyncGenerator<AgentEvent> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          yield JSON.parse(line.slice(6));
        }
      }
    }
  }
}
```

#### Chat View

```typescript
// packages/obsidian-plugin/src/views/chat-view.ts

export class RAChatView extends ItemView {
  private client: RAClient;
  private sessionId?: string;
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;

  getViewType() { return "ra-chat"; }
  getDisplayText() { return "Research Assistant"; }
  getIcon() { return "message-circle"; }

  async onOpen() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ra-chat-container");

    this.messagesEl = containerEl.createDiv("ra-messages");
    const inputArea = containerEl.createDiv("ra-input-area");
    this.inputEl = inputArea.createEl("textarea", { placeholder: "Ask about your vault..." });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  async sendMessage() {
    const prompt = this.inputEl.value.trim();
    if (!prompt) return;
    this.inputEl.value = "";

    // Render user message
    this.appendMessage("user", prompt);

    // Stream response
    const responseEl = this.appendMessage("assistant", "");
    let fullText = "";

    for await (const event of this.client.chat(prompt, this.sessionId)) {
      if (event.type === "text") {
        fullText += event.text;
        await MarkdownRenderer.render(this.app, fullText, responseEl, "", this);
      }
      if (event.type === "tool_start") {
        this.showToolActivity(event.toolName!);
      }
      if (event.type === "done") {
        this.sessionId = event.sessionId;
      }
    }
  }

  private appendMessage(role: "user" | "assistant", text: string): HTMLElement {
    const el = this.messagesEl.createDiv(`ra-message ra-${role}`);
    if (text) el.setText(text);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return el;
  }

  private showToolActivity(toolName: string) {
    // Show a subtle "Searching vault..." indicator
  }
}
```

#### Commands

```typescript
// packages/obsidian-plugin/src/commands.ts

export function registerCommands(plugin: RAPlugin) {
  plugin.addCommand({
    id: "ra:chat",
    name: "Open chat",
    callback: () => plugin.activateView("ra-chat"),
  });

  plugin.addCommand({
    id: "ra:ask",
    name: "Ask about vault",
    callback: () => {
      new PromptModal(plugin.app, async (prompt) => {
        // Stream response into a results modal
        const modal = new ResponseModal(plugin.app);
        modal.open();
        for await (const event of plugin.client.ask(prompt)) {
          if (event.type === "text") modal.append(event.text!);
        }
      }).open();
    },
  });

  plugin.addCommand({
    id: "ra:search",
    name: "Search vault",
    callback: () => {
      new PromptModal(plugin.app, async (query) => {
        const results = await plugin.client.search(query);
        new ResultsModal(plugin.app, results).open();
      }).open();
    },
  });

  plugin.addCommand({
    id: "ra:link-suggest",
    name: "Suggest links for current note",
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) return false;
      if (checking) return true;
      // Stream link suggestions
    },
  });

  plugin.addCommand({
    id: "ra:review",
    name: "Review recent changes",
    callback: () => { /* Stream review into chat panel */ },
  });

  plugin.addCommand({
    id: "ra:index",
    name: "Re-index vault",
    callback: async () => {
      new Notice("Indexing vault...");
      await plugin.client.index();
      new Notice("Vault indexed.");
    },
  });
}
```

#### Auto-Start Server

On desktop, the plugin can optionally start the server as a child process:

```typescript
// In main.ts onload()
if (this.settings.autoStartServer && Platform.isDesktop) {
  const basePath = (this.app.vault.adapter as any).basePath;
  this.serverProcess = spawn("ra", ["serve", "--port", "3117"], {
    env: { ...process.env, RA_VAULT: basePath },
    stdio: "ignore",
    detached: true,
  });
  this.serverProcess.unref();
}
```

## Shared Types (`@ra/core/types/api.ts`)

Request/response types shared between server and clients:

```typescript
// Search
export interface SearchRequest { query: string; mode?: string; limit?: number }
export interface SearchResponse { results: SearchResult[] }

// Ask
export interface AskRequest { prompt: string; model?: string; maxTurns?: number }
// Response: SSE stream of AgentEvent

// Chat
export interface ChatRequest { prompt: string; model?: string; maxTurns?: number }
export interface ChatResumeRequest { prompt: string }
// Response: SSE stream of AgentEvent

// Notes
export interface NoteListResponse { notes: { path: string; basename: string }[] }
export interface NoteResponse { path: string; body: string; frontmatter: Record<string, any> }
export interface NoteWriteRequest { content: string }

// Link Suggest
export interface LinkSuggestRequest { file: string; apply?: boolean; model?: string }

// Review
export interface ReviewRequest { recentDays?: number; model?: string }

// Index
export interface IndexRequest { update?: boolean }
export interface IndexResponse { status: string; documentsIndexed?: number }
```

## Migration Path

Moving from the current flat structure to the monorepo:

### Step 1: Create workspace structure
```sh
mkdir -p packages/{core,server,cli,obsidian-plugin}/src
```

### Step 2: Move core logic
```sh
# Current → New
src/agent/*              → packages/core/src/agent/
src/integrations/*       → packages/core/src/integrations/
src/types/*              → packages/core/src/types/
src/utils/*              → packages/core/src/utils/
```

### Step 3: Refactor engine to return iterables (not write to stdout)
- `askOnce()` → `askStream()` returning `AsyncGenerator<AgentEvent>`
- `chatLoop()` → `chatStream()` returning `AsyncGenerator<AgentEvent>`
- CLI reconstructs the stdout/readline behavior from the generator

### Step 4: Move CLI
```sh
src/index.ts             → packages/cli/src/index.ts
src/commands/*           → packages/cli/src/commands/
src/config.ts            → packages/cli/src/config.ts
```
Update imports: `../agent/engine` → `@ra/core`

### Step 5: Build server
New code. Wrap core's generators in SSE endpoints.

### Step 6: Build Obsidian plugin
New code. Thin HTTP client + Obsidian UI components.

## Implementation Phases

### Phase 1: Monorepo Scaffold + Core Extraction

- [ ] Set up Bun workspace (`package.json`, `bunfig.toml`, `tsconfig.base.json`)
- [ ] Create `@ra/core` — move agent, integrations, types, utils
- [ ] Refactor `askOnce` → `askStream` (async generator returning `AgentEvent`)
- [ ] Refactor `chatLoop` → `chatStream` (async generator)
- [ ] Create `@ra/core` barrel export
- [ ] Create `@ra/cli` — move CLI commands, update imports to use `@ra/core`
- [ ] Verify `bun run ra` still works end-to-end

### Phase 2: Server

- [ ] Build `@ra/server` with Bun.serve or Hono
- [ ] Implement `/health`, `/search`, `/notes` routes (non-streaming)
- [ ] Implement `/ask`, `/chat` SSE streaming routes
- [ ] Implement `/link-suggest`, `/review` SSE routes
- [ ] Implement `/index` route
- [ ] Add bearer token auth middleware
- [ ] Add `ra serve` command to CLI
- [ ] Test all routes with `curl` / manual SSE consumption

### Phase 3: Obsidian Plugin — Core

- [ ] Scaffold from obsidian-sample-plugin template
- [ ] Implement settings tab (server URL, token, model prefs)
- [ ] Build `RAClient` HTTP/SSE client
- [ ] Register command palette commands
- [ ] Implement search command → results modal with clickable links
- [ ] Implement ask command → response modal with streaming

### Phase 4: Obsidian Plugin — Chat Panel

- [ ] Build `RAChatView` (ItemView) with message list + input
- [ ] Wire up SSE streaming for chat responses
- [ ] Render markdown with Obsidian's `MarkdownRenderer`
- [ ] Show tool-use activity indicators (searching, reading notes)
- [ ] Multi-turn session management (resume via sessionId)
- [ ] "New conversation" button

### Phase 5: Obsidian Plugin — Advanced Features

- [ ] Link suggest command — run on active note, show suggestions, apply button
- [ ] Review command — output to chat panel
- [ ] "Ask about this note" in file explorer context menu
- [ ] Auto-start server on plugin load (desktop, opt-in)
- [ ] Re-index command with progress notice

### Phase 6: Polish

- [ ] Loading states and error handling (server unreachable, auth failure, rate limits)
- [ ] Keyboard shortcuts (`Cmd+Shift+R` for chat)
- [ ] Style chat panel with Obsidian CSS variables (theme-aware)
- [ ] Auto-reconnect if server restarts
- [ ] Test with multiple vaults
- [ ] README and setup instructions for end users

## Constraints and Gotchas

- **QMD needs Node** — `node` not `bun` for sqlite-vec (unchanged, lives in `@ra/core`)
- **Server must be running** — plugin depends on it; auto-start mitigates this on desktop
- **Desktop only for auto-start** — mobile Obsidian can't spawn processes, but could connect to a server running on the same machine / network
- **CORS** — server must allow `app://obsidian.md` origin
- **Bundle size** — plugin is now tiny (just HTTP client + UI), no heavy deps
- **Token security** — server token stored in plaintext in Obsidian settings; acceptable for localhost-only server
- **Port conflicts** — default 3117, configurable; server should fail fast if port is taken

## Alternatives Considered

**Why not bundle everything in the plugin (original plan)?** Fragile subprocess spawning in Electron renderer, bloated bundle, single-client lock-in.

**Why not a WebSocket server instead of SSE?** SSE is simpler for unidirectional streaming (server → client). The client only sends requests via POST. No need for bidirectional streaming.

**Why not use Obsidian's `requestUrl` instead of `fetch`?** `requestUrl` is for external APIs and handles CORS. For localhost, native `fetch` works and is simpler.

**Why Bun workspaces over Turborepo/Nx?** Minimal overhead. Bun workspaces handle dependency resolution and running scripts across packages. No need for a build orchestrator when each package has a simple build step.
