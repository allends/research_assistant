# Research Assistant — MVP Plan

## Project Overview

**Name:** `research-assistant` (alias: `ra`)
**Runtime:** Bun
**Language:** TypeScript
**Scope:** Obsidian-only (requires `.obsidian/` vault directory)
**Architecture:** Local-first CLI tool that operates over an Obsidian vault, combining semantic search (via QMD), AI-powered knowledge management (via Claude Agent SDK used internally), and direct vault manipulation (via Obsidian CLI 1.12+). The user interface is purely CLI commands — no MCP server is exposed.

---

## Core Thesis

An Obsidian vault is a personal knowledge graph stored as markdown files. This project wraps it with:

1. **QMD** for hybrid search (BM25 + vector + LLM re-ranking) — already built, battle-tested, local-first
2. **Claude Agent SDK** for intelligent operations — summarization, linking suggestions, content generation, Q&A over your vault
3. **Obsidian CLI** (1.12+, Early Access) for vault-aware operations — metadata cache, link graph, plugin access via `obsidian eval`
4. **A thin CLI** that ties it all together and exposes these capabilities as composable commands

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | **Bun** | Native SQLite, fast startup, TypeScript-first, TS execution without build step |
| Language | **TypeScript** (strict) | Type safety, Agent SDK is TS-native |
| Agent Framework | **`@anthropic-ai/claude-agent-sdk`** (^0.2.0) | Agentic loop with built-in tools (file read/write/edit, bash, grep, glob), MCP server support, sub-agents |
| Search Engine | **QMD** (`@tobilu/qmd` v1.0.6) | Local hybrid search: BM25 + vector + LLM re-ranking. SQLite + sqlite-vec storage. Has MCP server. Bun-native. |
| Vault Access | **Obsidian CLI** (`obsidian eval`) | Direct access to metadata cache, link graph, search index, plugin APIs — no file parsing needed |
| Vault Access (fallback) | **Direct filesystem** | For when Obsidian app isn't running — parse frontmatter with `gray-matter`, read markdown directly |
| CLI Framework | **`commander`** or **`citty`** | Lightweight CLI argument parsing |
| Config | **`~/.research-assistant/config.json`** | Vault path, model preferences, QMD collection name |
| Embedding Model | **Via QMD** (embeddinggemma-300M-Q8_0, GGUF) | QMD handles embedding generation and storage via node-llama-cpp. No separate embedding infra needed. |
| QMD Execution | **`node`** (not `bun`) | Bun's built-in SQLite on macOS uses Apple's SQLite which lacks `loadExtension()`, breaking sqlite-vec. QMD entry point resolved via `import.meta.resolve()` and run as a Node subprocess. |

### Key Dependency Versions

```json
{
  "name": "research-assistant",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "bin": {
    "ra": "./src/index.ts",
    "research-assistant": "./src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.45",
    "@tobilu/qmd": "^1.0.6",
    "commander": "^12.0.0",
    "gray-matter": "^4.0.3",
    "glob": "^11.0.0",
    "zod": "^4.3.6"
  },
  "scripts": {
    "ra": "bun run src/index.ts --",
    "test:smoke": "bun run tests/dev-smoke.ts",
    "test:cli": "bun run tests/cli-smoke.ts",
    "test:all": "bun run test:smoke && bun run test:cli"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/bun": "latest"
  },
  "overrides": {
    "better-sqlite3": "^12.6.0"
  }
}
```

> **Note:** QMD is installed as a **local dependency**, not globally. It is invoked via `node` (not `bun`) because Bun's macOS SQLite lacks `loadExtension()` support needed by sqlite-vec. The Agent SDK (`@anthropic-ai/claude-agent-sdk@^0.2.45`) and Zod (`zod@^4.3.6`) are installed for the agentic commands (`ask`, `chat`).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  research-assistant CLI                       │
│  ra search "how do I handle auth?"                           │
│  ra ask "summarize my project notes"                         │
│  ra link-suggest ./notes/new-idea.md                         │
│  ra review --recent 7d                                       │
│  ra chat                                                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌───────────────┐    ┌─────────────────────┐
│  Command      │    │  Agent Engine        │
│  Router       │    │  (Claude Agent SDK)  │
│               │    │                      │
│  - search     │    │  - query()           │
│  - ask        │    │  - Sub-agents        │
│  - chat       │    │  - MCP tools         │
│  - link       │    │  - Custom tools      │
│  - review     │    │                      │
│  - index      │    └──────┬──────────────┘
└───────┬───────┘           │
        │            ┌──────┴──────────────────┐
        │            │                          │
        ▼            ▼                          ▼
┌──────────────┐ ┌──────────────────┐  ┌──────────────────┐
│  QMD         │ │ Obsidian CLI     │  │ Filesystem       │
│              │ │ (Early Access)   │  │ (fallback)       │
│ - search     │ │                  │  │                  │
│ - vsearch    │ │ - eval / dev:eval│  │ - gray-matter    │
│ - query      │ │ - files list     │  │ - glob           │
│ - get        │ │ - files read     │  │ - fs.readFile    │
│ - multi-get  │ │ - search content │  │                  │
│ - MCP server │ │ - property:read  │  │                  │
└──────────────┘ └──────────────────┘  └──────────────────┘
```

### Data Flow for a Typical Query

```
User runs: ra ask "what are my open project threads?"

1. CLI parses command → routes to `ask` handler (src/commands/ask.ts)
2. Handler loads config, builds system prompt with vault context
3. Calls askOnce() in src/agent/engine.ts which invokes Agent SDK query():
   - System prompt describing the vault (path, folders, note count)
   - In-process MCP server with custom tools:
     a. qmd_search → calls src/integrations/qmd.ts hybridSearch()
     b. qmd_get → calls src/integrations/qmd.ts get()
     c. vault_list → calls src/integrations/vault-fs.ts listNotes()
     d. vault_read → calls src/integrations/vault-fs.ts readNote()
     e. vault_write → calls src/integrations/vault-fs.ts writeNote()
     f. obsidian_eval → calls src/integrations/obsidian-cli.ts evalCode()
   - permissionMode: "bypassPermissions" (agent has full vault access)
   - maxTurns: 25 (default, configurable via --max-turns)
4. Agent autonomously decides which tools to call:
   - Calls qmd_search to find relevant notes
   - Reads promising files via qmd_get or vault_read
   - May call vault_list to explore vault structure
   - Synthesizes an answer citing sources with [[wikilinks]]
5. Response streamed to terminal as text blocks arrive (no buffering)
```

---

## Project Structure

```
research-assistant/
├── src/
│   ├── index.ts              # CLI entry point (commander setup, global --verbose flag)
│   ├── config.ts             # Config loading (~/.research-assistant/config.json + RA_DEV/RA_VAULT env)
│   ├── commands/
│   │   ├── search.ts         # ✅ Direct QMD search passthrough + formatting
│   │   ├── ask.ts            # ✅ Single-turn agent Q&A over vault
│   │   ├── chat.ts           # ✅ Multi-turn conversational agent (interactive REPL)
│   │   ├── link-suggest.ts   # ✅ Suggest [[wikilinks]] for a note
│   │   ├── review.ts         # ✅ Review recent changes, surface insights
│   │   ├── index-cmd.ts      # ✅ (Re)index vault with QMD
│   │   └── init.ts           # ✅ Initialize research-assistant for a vault
│   ├── agent/
│   │   ├── engine.ts         # ✅ askOnce() + chatLoop() via Agent SDK query()
│   │   ├── system-prompts.ts # ✅ Dynamic vault-aware system prompts (ask/chat/link-suggest/review)
│   │   └── tools.ts          # ✅ 6 MCP tools (qmd_search, qmd_get, vault_list/read/write, obsidian_eval)
│   ├── integrations/
│   │   ├── qmd.ts            # ✅ QMD wrapper (node subprocess, import.meta.resolve entry point)
│   │   ├── obsidian-cli.ts   # ✅ Obsidian CLI wrapper (eval, commands)
│   │   └── vault-fs.ts       # ✅ Direct filesystem access (fallback)
│   ├── utils/
│   │   ├── markdown.ts       # ✅ Wikilink extraction, tag extraction, heading extraction
│   │   ├── formatter.ts      # ✅ Terminal output formatting (colored scores, file paths, snippets)
│   │   └── logger.ts         # ✅ Structured logging (debug/info/error/warn, setVerbose)
│   └── types/
│       ├── config.ts         # ✅ Config schema types + DEFAULT_CONFIG
│       ├── vault.ts          # ✅ Vault/note types
│       └── search.ts         # ✅ Search result types, QmdSearchResult, QmdStatusResponse, SearchMode
├── tests/
│   ├── dev-smoke.ts          # ✅ Config, vault-fs, markdown utils, cross-links, frontmatter tests
│   └── cli-smoke.ts          # ✅ CLI integration tests (help, version, dev mode bypass, init validation)
├── test-vault/               # ✅ 13 synthetic notes across 5 folders
│   ├── .obsidian/app.json
│   ├── projects/             # research-assistant.md, home-automation.md
│   ├── daily-notes/          # 2026-02-10.md, 2026-02-11.md, 2026-02-12.md
│   ├── references/           # obsidian-plugin-api.md, typescript-patterns.md, vector-search.md
│   ├── areas/                # health.md, programming.md, reading-list.md
│   └── inbox/                # article-clip.md, fleeting-thought.md
├── docs/
│   └── cli.md                # ✅ CLI reference documentation
├── setup.sh                  # ✅ One-step dev environment setup (bun, deps, .env, qmd check)
├── .env                      # RA_DEV=1, RA_VAULT=./test-vault (gitignored)
├── CLAUDE.md                 # ✅ Bun conventions, API preferences, testing, frontend patterns
├── package.json              # ✅ With bin entries, scripts, overrides
├── tsconfig.json             # ✅ Strict mode
└── README.md                 # ✅ Basic project description
```

---

## MVP Commands

### 1. `ra init [vault-path]`

```bash
ra init ~/Obsidian/MyVault
ra init                      # uses RA_VAULT env var
```

- Vault path argument is optional — defaults to `RA_VAULT` environment variable if not provided
- Detects vault path, validates it's an Obsidian vault (has `.obsidian/` dir)
- Creates `~/.research-assistant/config.json`
- Registers vault as a QMD collection: `qmd collection add <path> --name <vault-name>`
- Adds context: `qmd context add qmd://<vault-name> "Personal Obsidian knowledge base"`
- Runs initial embedding: `qmd embed`
- Checks if Obsidian CLI is available (`obsidian --version`)
- Warns if Obsidian CLI is not found (graceful degradation to filesystem fallback)

### 2. `ra search <query>`

```bash
ra search "authentication patterns"
ra search "auth" --mode keyword     # BM25 only
ra search "auth" --mode semantic    # vector only
ra search "auth" --mode hybrid      # full pipeline (default)
ra search "auth" -n 10 --json
```

- Thin wrapper around QMD with nicer formatting
- Maps `--mode` to `qmd search` / `qmd vsearch` / `qmd query`
- Displays results with score, filepath, snippet, and context

### 3. `ra ask <question>`

```bash
ra ask "what are my main project threads right now?"
ra ask "summarize everything I know about React Server Components"
ra ask "what notes should I revisit?" --recent 30d
```

- Single-turn agent interaction
- Uses Claude Agent SDK `query()` with:
  - Custom MCP tools for QMD search and vault access
  - System prompt scoped to the question type
  - `permissionMode: "bypassPermissions"` (agent has full read/write access by default)
  - `allowedTools`: Read, Write, Edit, Grep, Glob + custom MCP tools (prefixed as `mcp__research-assistant__<tool_name>`)
- Agent searches vault via QMD, reads relevant notes, synthesizes answer

### 4. `ra chat`

```bash
ra chat
ra chat --context "projects/current-sprint.md"
```

- Multi-turn interactive session using V1 `query()` with manual conversation history
- Maintains conversation history across turns by accumulating messages and re-sending
- Agent has full tool access to search, read, and write vault
- Can be pre-seeded with context from a specific note

### 5. `ra link-suggest <file>`

```bash
ra link-suggest ./notes/new-idea.md
ra link-suggest ./notes/new-idea.md --apply  # auto-insert links
```

- Reads the target note
- Uses QMD semantic search to find related notes
- Uses Obsidian CLI to get existing link graph (falls back to filesystem wikilink parsing)
- Agent suggests [[wikilinks]] that should be added
- With `--apply`, writes the updated file

### 6. `ra index`

```bash
ra index              # re-index and re-embed
ra index --update     # incremental (QMD handles this)
ra index --status     # show index health
```

- Wraps `qmd update` and `qmd embed`
- Shows stats: notes indexed, embeddings generated, collection health

---

## Agent Architecture Details

### MCP Tool Definitions (Internal — Not User-Facing)

The Agent SDK uses MCP internally to wire custom tools into the agentic loop. We define tools via `tool()` and bundle them into an in-process MCP server via `createSdkMcpServer()`. This server is **not** exposed externally — it's an SDK implementation detail. The user interacts via CLI commands only.

```typescript
// src/agent/tools.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod"; // Agent SDK re-exports zod or expects it as a peer

export const qmdSearchTool = tool(
  "qmd_search",
  "Search the knowledge base using hybrid search (BM25 + semantic + re-ranking). Returns scored results with file paths and snippets.",
  {
    query: z.string().describe("Natural language search query"),
    mode: z.enum(["keyword", "semantic", "hybrid"]).default("hybrid"),
    limit: z.number().min(1).max(50).default(10),
    min_score: z.number().min(0).max(1).default(0.3),
  },
  async (args) => {
    const cmd = args.mode === "keyword" ? "search"
              : args.mode === "semantic" ? "vsearch"
              : "query";
    const result = await $`qmd ${cmd} ${args.query} -n ${args.limit} --min-score ${args.min_score} --json`;
    return { content: [{ type: "text", text: result.stdout }] };
  }
);

export const qmdGetTool = tool(
  "qmd_get",
  "Retrieve the full content of a document by file path or docid.",
  {
    ref: z.string().describe("File path or docid (#abc123)"),
    line_numbers: z.boolean().default(false),
  },
  async (args) => {
    const flags = args.line_numbers ? "--line-numbers" : "";
    const result = await $`qmd get ${args.ref} ${flags}`;
    return { content: [{ type: "text", text: result.stdout }] };
  }
);

export const obsidianEvalTool = tool(
  "obsidian_eval",
  "Execute JavaScript inside the running Obsidian app. Has access to app.vault, app.metadataCache, and all plugin APIs. Use for metadata queries, link graph traversal, and vault-wide operations. Requires Obsidian desktop to be running.",
  {
    code: z.string().describe("JavaScript code to execute in Obsidian"),
  },
  async (args) => {
    const result = await $`obsidian eval code=${JSON.stringify(args.code)}`;
    return { content: [{ type: "text", text: result.stdout }] };
  }
);

export const vaultMcpServer = createSdkMcpServer({
  name: "research-assistant",
  version: "0.1.0",
  tools: [qmdSearchTool, qmdGetTool, obsidianEvalTool],
});
```

### Sub-Agent Definitions

```typescript
// src/agent/sub-agents.ts
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const agents: Record<string, AgentDefinition> = {
  researcher: {
    description: "Deep-dives into the vault to find and synthesize information on a topic",
    tools: ["mcp__research-assistant__qmd_search", "mcp__research-assistant__qmd_get", "Read", "Grep"],
    prompt: `You are a research assistant with access to a personal knowledge base.
Your job is to thoroughly search the vault, read relevant notes, and synthesize findings.
Always cite which notes your information comes from using [[wikilinks]].
Prefer QMD hybrid search (qmd_search with mode=hybrid) for best results.`,
    model: "sonnet" as const,
  },
  linker: {
    description: "Analyzes a note and suggests relevant connections",
    tools: ["mcp__research-assistant__qmd_search", "mcp__research-assistant__qmd_get", "mcp__research-assistant__obsidian_eval"],
    prompt: `You are a knowledge graph assistant. Given a note, find related notes
in the vault and suggest [[wikilinks]] that would strengthen the knowledge graph.
Use semantic search to find conceptually related notes, not just keyword matches.
Use obsidian_eval to check existing backlinks and avoid duplicates.`,
    model: "haiku" as const,
  },
};
```

> **Note on MCP tool naming:** The Agent SDK prefixes MCP tool names with `mcp__<server-name>__<tool-name>` when referencing them in `allowedTools` and `agents[].tools`. Verify the exact convention at implementation time — this may vary by SDK version.

### Agent Engine

```typescript
// src/agent/engine.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage, SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import { vaultMcpServer } from "./tools";
import { agents } from "./sub-agents";

export async function ask(prompt: string, options: AskOptions) {
  for await (const message of query({
    prompt,
    options: {
      model: "claude-sonnet-4-5",
      systemPrompt: buildSystemPrompt(options),
      mcpServers: { "research-assistant": vaultMcpServer },
      agents,
      allowedTools: [
        "Read", "Write", "Edit", "Glob", "Grep", "Task",  // built-in tools (Task for sub-agents, Write/Edit for vault modifications)
        "mcp__research-assistant__qmd_search",
        "mcp__research-assistant__qmd_get",
        "mcp__research-assistant__obsidian_eval",
      ],
      permissionMode: "bypassPermissions",
      maxTurns: 25,
    },
  })) {
    // SDKAssistantMessage has message.message.content (array of content blocks)
    if (message.type === "assistant") {
      const assistantMsg = message as SDKAssistantMessage;
      for (const block of assistantMsg.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
    }
  }
}
```

---

## Configuration

### `~/.research-assistant/config.json`

```json
{
  "vault": {
    "path": "/Users/allen/Obsidian/MainVault",
    "qmd_collection": "main-vault",
    "obsidian_cli": true
  },
  "defaults": {
    "model": "claude-sonnet-4-5",
    "search_mode": "hybrid",
    "search_results": 10
  },
  "agent": {
    "max_turns": 25,
    "permission_mode": "bypassPermissions"
  }
}
```

### Environment Variables

| Variable | Effect |
|----------|--------|
| `RA_DEV` | Set to `1` or `true` to use dev mode (skips config file requirement) |
| `RA_VAULT` | Override vault path from environment (e.g., `RA_VAULT=./test-vault`). Takes priority over config file. |

Both `RA_DEV=1` and `RA_VAULT=<path>` bypass the requirement for `~/.research-assistant/config.json`. The collection name is auto-derived from the vault directory name. If `~/.research-assistant/config.json` exists, its values are merged on top of the env-derived defaults.
```

---

## Implementation Plan (Phased)

### Phase 1: Foundation (Days 1–2) ✅ COMPLETED

- [x] Project scaffolding: `bun init`, tsconfig, package.json
  - *Bun 1.3.9, TypeScript 5.9.3, strict mode enabled*
  - *Bin entries: `ra` and `research-assistant` pointing to `./src/index.ts`*
  - *Dependencies: commander@12.1.0, glob@11.1.0, gray-matter@4.0.3, @tobilu/qmd@^1.0.6*
  - *`better-sqlite3@^12.6.0` override in package.json for compatibility*
- [x] Config system: load/save `~/.research-assistant/config.json`
  - *`src/config.ts` — `loadConfig()`, `saveConfig()`, `validateVaultPath()`, `configExists()`, `getConfigPath()`, `getVaultPath()`*
  - *Typed config with defaults via `src/types/config.ts`*
  - *`RA_VAULT` env var support: overrides vault path from environment (e.g., `RA_VAULT=./test-vault`)*
  - *`RA_DEV` and `RA_VAULT` both trigger config bypass — no `~/.research-assistant/config.json` required*
  - *Vault path resolved via `resolve()` for absolute path normalization*
  - *Collection name auto-derived from vault directory name (lowercased, non-alphanumeric replaced with dashes)*
- [x] QMD wrapper (`src/integrations/qmd.ts`):
  - *QMD installed as a **local dependency** (`@tobilu/qmd` in package.json), NOT globally*
  - *Resolves QMD entry point via `import.meta.resolve("@tobilu/qmd/dist/qmd.js")`*
  - *Runs via `node` (not `bun`) because Bun's built-in SQLite on macOS uses Apple's SQLite which doesn't support `loadExtension()`, breaking sqlite-vec for vector search*
  - *Uses `Bun.spawn` for subprocess execution, reads stdout/stderr concurrently via `Promise.all` to avoid deadlock*
  - *Methods: `search()`, `vsearch()`, `query()`, `hybridSearch()`, `get()`, `multiGet()`, `status()`, `collectionAdd()`, `contextAdd()`, `embed()`, `update()`, `isAvailable()`*
- [x] Obsidian CLI wrapper (`src/integrations/obsidian-cli.ts`):
  - *`evalCode()`, `isAvailable()`, `listFiles()`, `readFile()`, `searchContent()`, `readProperty()`, `getVersion()`*
  - *Graceful error handling — all methods throw on non-zero exit, callers can catch*
  - *CLI Early Access: wrapper is resilient to changes via try/catch patterns*
- [x] Vault filesystem wrapper (`src/integrations/vault-fs.ts`):
  - *`readNote()`, `writeNote()`, `listNotes()`, `parseFrontmatter()`, `extractWikilinks()`, `getVaultStats()`, `isObsidianVault()`*
  - *Also created `src/utils/markdown.ts` with additional helpers: `extractTags()`, `extractHeadings()`*
- [x] CLI skeleton with `commander`:
  - *`init`, `search`, `index` commands implemented*
  - *`init`: accepts optional `[vault-path]` argument, defaults to `RA_VAULT` env var if not provided*
  - *`init`: validates vault, checks QMD + Obsidian CLI, registers collection, runs initial indexing*
  - *`search`: supports `--mode keyword|semantic|hybrid`, `--limit`, `--min-score`, `--json`*
  - *`index`: supports `--update` (incremental) and `--status` flags*
  - *Global `-v, --verbose` flag with `preAction` hook to set verbose logging*
  - *Also created: `src/utils/formatter.ts` (colored terminal output), `src/utils/logger.ts` (debug/info/error/warn with `setVerbose()`)*
  - *All type definitions: `src/types/config.ts`, `src/types/vault.ts`, `src/types/search.ts`*
  - *Type-checks clean with `tsc --noEmit`*

### Dev Environment Setup ✅ COMPLETED

- [x] Created `test-vault/` with 13 synthetic notes across 5 folders (projects, daily-notes, references, areas, inbox)
  - *Notes include YAML frontmatter, wikilinks, inline tags, cross-links, and varied vocabulary*
  - *`.obsidian/app.json` present for vault validation*
  - *All 13 notes have `title`, `tags`, and `created` frontmatter fields*
  - *Cross-folder wikilinks verified (≥5 notes link across folders)*
- [x] Dev mode via `RA_DEV=1` and `RA_VAULT` environment variables
  - *`src/config.ts` — added `isDevMode()`, `getProjectRoot()`, `getVaultPath()`, updated `configExists()` and `loadConfig()`*
  - *`.env` file with `RA_DEV=1` and `RA_VAULT=./test-vault` (gitignored, auto-loaded by Bun)*
  - *Dev mode returns config pointing to `test-vault/` without needing `ra init`*
  - *Real `~/.research-assistant/config.json` merges on top if it exists*
- [x] `setup.sh` — one-step dev environment setup script
  - *Checks for bun, runs `bun install`, creates `.env` with defaults if missing*
  - *Checks for qmd availability and warns if not found*
  - *Detects vault from `RA_VAULT` in `.env` and prompts to run `ra init`*
- [x] Smoke tests (`tests/dev-smoke.ts`, `tests/cli-smoke.ts`)
  - *`bun run test:smoke` — unit-level tests for config, vault-fs, markdown utilities, cross-links, frontmatter completeness*
  - *`bun run test:cli` — CLI integration tests: `--help`, `--version`, `search --help`, `index --help`, dev mode config bypass, init vault validation*
  - *`bun run test:all` — runs both test suites sequentially*
  - *Custom test harness with colored pass/fail output (no test framework dependency)*
- [x] Documentation
  - *`docs/cli.md` — CLI reference with commands, options, environment variables, config location*
  - *`README.md` — basic project description*
  - *`CLAUDE.md` — project instructions for Claude Code (Bun conventions, API preferences, testing, frontend patterns)*

### Phase 2: CLI Agent Commands (Days 3–5) ✅ COMPLETED

**Goal:** Expose `ra ask` and `ra chat` as CLI commands powered by the Claude Agent SDK internally. The user interacts via the terminal — no MCP server is exposed. The Agent SDK's `query()` drives an agentic loop where Claude can call custom tools (QMD search, vault read/write) to answer questions about the vault.

- [x] Install Agent SDK and dependencies
  - *`@anthropic-ai/claude-agent-sdk@^0.2.45` and `zod@^4.3.6` added to package.json*
  - *Authentication: `ANTHROPIC_API_KEY` (API billing) or `CLAUDE_CODE_OAUTH_TOKEN` (Max subscription billing)*
  - *Added `bun run ra` script for dogfooding (`bun run ra -- search "query"`)*
- [x] Define custom tools (`src/agent/tools.ts`)
  - *`createVaultMcpServer(vaultPath)` factory function — creates MCP server scoped to a vault path*
  - *6 tools: `qmd_search`, `qmd_get`, `vault_list`, `vault_read`, `vault_write`, `obsidian_eval`*
  - *`qmd_search` wraps `qmd.hybridSearch()` with mode/limit params*
  - *`obsidian_eval` gracefully returns fallback message when CLI unavailable (try/catch)*
  - *All tools return MCP `CallToolResult` format: `{ content: [{ type: "text", text: "..." }] }`*
  - *Bundled via `createSdkMcpServer({ name: "vault", version: "0.1.0", tools: [...] })`*
- [x] System prompts (`src/agent/system-prompts.ts`)
  - *`askSystemPrompt(config)` — dynamically includes vault path, collection name, note count (from `vaultFs.getVaultStats`), and folder list*
  - *`chatSystemPrompt(config)` — extends ask prompt with chat-specific instructions (vault_write permission, conversation continuity, clarifying questions)*
- [x] Agent engine (`src/agent/engine.ts`)
  - *`askOnce(prompt, config, options)` — single-turn query with streaming output*
  - *`chatLoop(config, options)` — multi-turn REPL using `readline` interface*
  - *`checkAuth()` — validates `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` before any agent call*
  - *`writeAssistantContent(message)` — streams text blocks to stdout (no buffering)*
  - *Chat uses `resume: sessionId` from SDK result messages for multi-turn continuity (not manual message accumulation)*
  - *`--context` flag reads file via `Bun.file()` and prepends content to first prompt*
  - *`permissionMode: "bypassPermissions"` with `allowDangerouslySkipPermissions: true`*
  - *`cwd` set to vault path so built-in file tools operate within the vault*
  - *Only custom MCP tools in `allowedTools` (no built-in Read/Glob/Grep — agent uses vault tools instead)*
- [x] CLI commands (`src/commands/ask.ts`, `src/commands/chat.ts`)
  - *`ra ask <question>` — required arg, options: `--model`, `--max-turns`*
  - *`ra chat` — interactive REPL, options: `--model`, `--context <file>`*
  - *Both check `configExists()` and exit with helpful message if not initialized*
  - *Registered in `src/index.ts` alongside existing commands*
- [x] CLI smoke tests updated (`tests/cli-smoke.ts`)
  - *`ra ask --help` and `ra chat --help` tests added*
  - *Main help output verified to list `ask` and `chat` commands*
- [x] Bug fix: QMD search result field name
  - *`src/types/search.ts`: renamed `path` → `file` to match actual QMD JSON output*
  - *`src/utils/formatter.ts`: updated to use `r.file` instead of `r.path`*
- [x] CLAUDE.md updated
  - *Rewritten with project-specific architecture overview, key constraints, scripts, dogfooding guide, auth docs, and Agent SDK patterns*
  - *Removed generic Bun boilerplate (frontend patterns, Bun.serve, etc.) in favor of project-relevant info*

#### Resolved risks from Phase 2

1. **MCP tool name prefix** — Confirmed: `mcp__<server-name>__<tool-name>` convention works (e.g. `mcp__vault__qmd_search`).
2. **Multi-turn chat** — Uses `resume: sessionId` from SDK result messages. Works without manual message accumulation.
3. **Auth** — Early `checkAuth()` validates presence of `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` before any SDK call, with a clear error message.
4. **`allowDangerouslySkipPermissions`** — Required alongside `permissionMode: "bypassPermissions"` for the SDK to actually bypass permissions.

### Phase 3: Smart Features (Days 6–7) ✅ COMPLETED

- [x] `ra link-suggest <file>` — semantic search + agent analysis to suggest `[[wikilinks]]`
  - *`src/commands/link-suggest.ts` — reads target note, extracts existing wikilinks, builds focused system prompt*
  - *Uses `linkSuggestSystemPrompt()` with existing links context so agent avoids duplicates*
  - *`--apply` flag instructs agent to rewrite the note with inline wikilinks via `vault_write`*
  - *`--model` flag to override default model*
  - *Reuses `askOnce()` with custom `systemPrompt` option (engine refactored to accept override)*
- [x] `ra review --recent <days>` — surface recent vault changes and suggest actions
  - *`src/commands/review.ts` — scans vault for recently modified notes by mtime*
  - *`vaultFs.getRecentNotes(vaultPath, days)` added to `src/integrations/vault-fs.ts`*
  - *Uses `reviewSystemPrompt()` with the list of recent files and their modification dates*
  - *Defaults to 7 days lookback, configurable via `--recent <n>`*
  - *Shows count of recent notes before invoking agent*
  - *Agent reads each note, identifies patterns, and suggests grouped actions*
- Sub-agent definitions moved to `tasks/sub-agents.md` (future work, not part of Phase 3)

#### Implementation details from Phase 3

1. **Engine refactored** — `askOnce()` now accepts an optional `systemPrompt` override, allowing commands to provide custom prompts without modifying the engine.
2. **System prompts** — `linkSuggestSystemPrompt()` and `reviewSystemPrompt()` added to `src/agent/system-prompts.ts`. Both dynamically include vault context and task-specific instructions.
3. **`getRecentNotes()`** — New helper in `vault-fs.ts` that scans notes by `Bun.file().stat().mtime`, filters by day cutoff, and sorts by most recent first.
4. **CLI tests updated** — `tests/cli-smoke.ts` extended with `link-suggest --help` and `review --help` tests (12 total, all passing).

### Phase 4: Polish (Day 8)

- [ ] Error handling: graceful messages for missing API key, QMD not indexed, vault not found
- [ ] `--help` text for all commands with examples
- [ ] README update with full setup instructions, usage examples, and architecture overview
- [ ] Test coverage: expand `tests/cli-smoke.ts` with more integration tests
- [ ] Consider `--verbose` output showing tool calls and agent reasoning in real-time

---

## Key Design Decisions

### Why QMD over rolling our own embeddings?

QMD already solves the hard problems: chunking (900-token, 15% overlap, preferring markdown heading boundaries), hybrid retrieval with BM25+vector+reranking via reciprocal rank fusion, SQLite+sqlite-vec storage, and Bun-native execution. It includes query expansion via a fine-tuned Qwen3-based model and re-ranking via Qwen3-reranker. It has MCP server support (stdio + HTTP + daemon modes) and structured output formats (`--json`, `--csv`, `--md`, `--xml`, `--files`). Building this from scratch would be weeks of work. QMD is the right abstraction layer — we consume it as a CLI tool and wrap it with MCP tools for the agent.

### Why Obsidian CLI over direct filesystem access?

Obsidian 1.12's `obsidian eval` (or `obsidian dev:eval`) lets you execute JavaScript inside the running Obsidian app with full access to `app.vault`, `app.metadataCache`, `app.workspace`, and `app.plugins`. Instead of parsing thousands of markdown files to build a link graph, we can query Obsidian's in-memory metadata cache in a single call. The CLI also offers structured commands like `files list`, `files read`, `search content`, `property:read`, and `tags all`. This is orders of magnitude more efficient in both tokens and time. Direct filesystem access remains as a fallback for when Obsidian isn't running.

**Caveat:** The Obsidian CLI is an Early Access feature as of 1.12.0 (Feb 2026). The API surface may change, and there are known issues with colon-subcommand parameter parsing. Design the wrapper to be resilient to these changes.

### Why Agent SDK over raw Anthropic API?

The Agent SDK provides the agentic loop, built-in file tools, MCP server integration, sub-agents, and session management for free. Using the raw API means reimplementing all of that. The SDK also gives us `permissionMode` control and `maxTurns` limits for safety. It supports hooks (12 event types), sandboxing, and session forking.

### Why not an Obsidian plugin?

This is a CLI tool, not a plugin. It runs in the terminal alongside your development workflow and integrates with Claude Code. An Obsidian plugin would be locked into the Obsidian UI. The CLI can be composed with other tools, piped, scripted, and used by agents.

---

## Risks & Open Questions

### Technical Risks

1. **Obsidian CLI stability** — Early Access feature. API may change between Obsidian releases. Mitigation: robust fallback to filesystem, version checking, and error handling in the wrapper layer.
2. ~~**MCP tool name prefixing**~~ — **Resolved.** Confirmed convention: `mcp__<server>__<tool>` (e.g. `mcp__vault__qmd_search`). Works as expected with `createSdkMcpServer({ name: "vault" })`.
3. **Bun compatibility** — The Agent SDK targets Node.js 18+. Bun is listed as a supported runtime (`executable: 'bun'`), but edge cases may exist. **Resolved for QMD:** Bun's macOS SQLite lacks `loadExtension()`, so QMD runs via `node` subprocess. The Agent SDK itself runs under Bun without issues.
4. **QMD embedding model size** — The embeddinggemma-300M-Q8_0 model is ~300MB. First-run experience includes a model download. Should be communicated during `init`.
5. ~~**V1 chat limitations**~~ — **Resolved.** Chat uses `resume: sessionId` from SDK result messages for multi-turn continuity. No manual message accumulation needed. Long conversation context limits remain a theoretical concern but haven't been hit in practice.

### Resolved Design Decisions

- **CLI alias:** Primary binary is `ra` (short alias). `research-assistant` also registered as a bin alias.
- **Single vault for MVP.** Multi-vault deferred to post-MVP.
- **Write permissions enabled by default.** The agent can read and write vault files without requiring explicit flags.
- **V1 API with `resume: sessionId`.** Chat uses V1 `query()` with SDK's built-in session resumption — no manual message accumulation needed. V2 sessions deferred until the API stabilizes.
- **Obsidian-only.** Requires a valid Obsidian vault (`.obsidian/` directory). Non-Obsidian markdown directories are not supported.

---

## Future Considerations (Post-MVP)

- **Watch mode**: File watcher that auto-indexes new/changed notes and triggers re-embedding
- **Daily digest**: Cron job that generates a "daily review" note summarizing recent activity
- **Graph analysis**: Use Obsidian's link graph to find orphaned notes, dead links, clusters
- **Templates**: Agent-generated note templates based on vault patterns
- **QMD MCP daemon mode**: Long-lived daemon (`qmd mcp --daemon`) for faster repeated queries
- **Export**: Generate reports, summaries, or presentations from vault subsets
- **Agent SDK V2 sessions**: Migrate chat to `unstable_v2_createSession()` once the API stabilizes — eliminates manual conversation history management
- **Multi-vault**: Support multiple vaults with cross-vault search
- **Obsidian CLI watch**: Monitor CLI stability and adopt new commands as they stabilize
- **Non-Obsidian support**: Extend to plain markdown directories without `.obsidian/`

---

## Notes for the Implementing Agent

### Established Patterns (from Phases 1–2)

1. **Use `Bun.spawn`** for subprocess management. Read stdout and stderr concurrently via `Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])` to avoid deadlock when buffers fill.

2. **QMD runs via `node`, not `bun`** — Bun's built-in SQLite on macOS uses Apple's SQLite which lacks `loadExtension()`, breaking sqlite-vec. The QMD entry point is resolved via `import.meta.resolve("@tobilu/qmd/dist/qmd.js")` and executed as a Node subprocess.

3. **QMD's `--json` flag** is your best friend. All QMD commands support it and return structured data. Parse with `JSON.parse()` — no scraping needed. Other output formats available: `--csv`, `--md`, `--xml`, `--files`.

4. **Obsidian CLI availability** should be checked at runtime, not assumed. The fallback path (vault-fs.ts) is already built. Note the CLI is Early Access and command names use a category:subcommand format (e.g., `files list`, `property:read`, `search content`).

5. **MCP tool naming** — Confirmed convention: `mcp__<server-name>__<tool-name>` (e.g. `mcp__vault__qmd_search`). Server name comes from `createSdkMcpServer({ name: "vault" })`.

6. **Tool handlers** must return `{ content: [{ type: "text", text: "..." }] }` (MCP CallToolResult format), **not** `{ type: "text", text: "..." }`. Use `type: "text" as const` for TypeScript compatibility.

7. **Agent engine patterns** — `query()` returns an async iterable. Stream text blocks from `message.message.content` to stdout. Use `resume: sessionId` for multi-turn chat. Require `allowDangerouslySkipPermissions: true` alongside `permissionMode: "bypassPermissions"`.

8. **System prompts** dynamically include vault context (path, collection name, note count, folder list) via `vaultFs.getVaultStats()` and `vaultFs.listNotes()`.

9. **Include "Task" in allowedTools** if you want the main agent to delegate to sub-agents — the SDK uses the Task tool internally for sub-agent dispatch.

### Next Up: Phase 4

- Phases 1–3 are complete. The foundation, agent engine, and smart features are all working.
- Phase 4 focuses on polish: error handling, help text, README, and test coverage.
- Sub-agent definitions are spec'd in `tasks/sub-agents.md` for future implementation.
- Other future tasks are tracked in `tasks/` (e.g., `verbose-qmd-output.md`).
