# Obsidian Knowledge Base Agent — MVP Plan

## Project Overview

**Name:** `vault-mind` (working title)
**Runtime:** Bun
**Language:** TypeScript
**Architecture:** Local-first CLI + agent system that operates over an Obsidian vault, combining semantic search (via QMD), AI-powered knowledge management (via Claude Agent SDK), and direct vault manipulation (via Obsidian CLI 1.12+).

---

## Core Thesis

An Obsidian vault is a personal knowledge graph stored as markdown files. This project wraps it with:

1. **QMD** for hybrid search (BM25 + vector + LLM re-ranking) — already built, battle-tested, local-first
2. **Claude Agent SDK** for intelligent operations — summarization, linking suggestions, content generation, Q&A over your vault
3. **Obsidian CLI** (1.12+) for vault-aware operations — metadata cache, link graph, plugin access via `obsidian eval`
4. **A thin CLI** that ties it all together and exposes these capabilities as composable commands

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | **Bun** | Native SQLite, fast startup, TypeScript-first, TS execution without build step |
| Language | **TypeScript** (strict) | Type safety, Agent SDK is TS-native |
| Agent Framework | **`@anthropic-ai/claude-agent-sdk`** | Agentic loop with built-in tools (file read/write/edit, bash, grep, glob), MCP server support, sub-agents |
| Search Engine | **QMD** (`@tobilu/qmd`) | Local hybrid search: BM25 + vector + LLM re-ranking. SQLite + sqlite-vec storage. Already has MCP server. Bun-native. |
| Vault Access | **Obsidian CLI** (`obsidian eval`) | Direct access to metadata cache, link graph, search index, plugin APIs — no file parsing needed |
| Vault Access (fallback) | **Direct filesystem** | For when Obsidian app isn't running — parse frontmatter with `gray-matter`, read markdown directly |
| CLI Framework | **`commander`** or **`citty`** | Lightweight CLI argument parsing |
| Config | **`~/.vault-mind/config.json`** | Vault path, model preferences, QMD collection name |
| Embedding Model | **Via QMD** (embeddinggemma-300M, GGUF) | QMD handles embedding generation and storage via node-llama-cpp. No separate embedding infra needed. |

### Key Dependency Versions

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "latest",
    "commander": "^12.0.0",
    "gray-matter": "^4.0.3",
    "glob": "^11.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/bun": "latest"
  }
}
```

QMD is installed globally: `bun install -g @tobilu/qmd`

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    vault-mind CLI                        │
│  vault-mind search "how do I handle auth?"              │
│  vault-mind ask "summarize my project notes"            │
│  vault-mind link-suggest ./notes/new-idea.md            │
│  vault-mind review --recent 7d                          │
│  vault-mind chat                                        │
└──────────────────┬──────────────────────────────────────┘
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
┌──────────────┐ ┌──────────────┐  ┌──────────────────┐
│  QMD         │ │ Obsidian CLI │  │ Filesystem       │
│              │ │              │  │ (fallback)       │
│ - search     │ │ - eval       │  │                  │
│ - vsearch    │ │ - search     │  │ - gray-matter    │
│ - query      │ │ - list       │  │ - glob           │
│ - get        │ │ - read       │  │ - fs.readFile    │
│ - multi-get  │ │ - metadata   │  │                  │
│ - MCP server │ │ - links      │  │                  │
└──────────────┘ └──────────────┘  └──────────────────┘
```

### Data Flow for a Typical Query

```
User: "vault-mind ask 'what are my open project threads?'"

1. CLI parses command → routes to `ask` handler
2. Handler builds a system prompt with vault context
3. Agent SDK query() is called with:
   - System prompt describing the vault
   - Custom MCP tools registered:
     a. qmd_search (wraps `qmd query --json`)
     b. qmd_get (wraps `qmd get`)
     c. obsidian_eval (wraps `obsidian eval`)
     d. vault_list (wraps `obsidian list` or glob)
     e. vault_read (wraps file read)
     f. vault_write (wraps file write)
4. Agent autonomously:
   - Calls qmd_search to find relevant notes
   - Reads promising files via qmd_get
   - Synthesizes an answer
5. Response streamed to terminal
```

---

## Project Structure

```
vault-mind/
├── src/
│   ├── index.ts              # CLI entry point (commander setup)
│   ├── config.ts             # Config loading (~/.vault-mind/config.json)
│   ├── commands/
│   │   ├── search.ts         # Direct QMD search passthrough + formatting
│   │   ├── ask.ts            # Single-turn agent Q&A over vault
│   │   ├── chat.ts           # Multi-turn conversational agent
│   │   ├── link-suggest.ts   # Suggest [[wikilinks]] for a note
│   │   ├── review.ts         # Review recent changes, surface insights
│   │   ├── index-cmd.ts      # (Re)index vault with QMD
│   │   └── init.ts           # Initialize vault-mind for a vault
│   ├── agent/
│   │   ├── engine.ts         # Agent SDK wrapper, session management
│   │   ├── system-prompts.ts # System prompts per command
│   │   ├── tools.ts          # MCP tool definitions
│   │   └── sub-agents.ts     # Sub-agent definitions (researcher, writer, linker)
│   ├── integrations/
│   │   ├── qmd.ts            # QMD CLI wrapper (spawn + parse JSON output)
│   │   ├── obsidian-cli.ts   # Obsidian CLI wrapper (eval, commands)
│   │   └── vault-fs.ts       # Direct filesystem access (fallback)
│   ├── utils/
│   │   ├── markdown.ts       # Frontmatter parsing, wikilink extraction
│   │   ├── formatter.ts      # Terminal output formatting
│   │   └── logger.ts         # Structured logging
│   └── types/
│       ├── config.ts         # Config schema types
│       ├── vault.ts          # Vault/note types
│       └── search.ts         # Search result types
├── CLAUDE.md                 # Agent SDK project memory
├── package.json
├── tsconfig.json
├── bunfig.toml
└── README.md
```

---

## MVP Commands

### 1. `vault-mind init`

```bash
vault-mind init ~/Obsidian/MyVault
```

- Detects vault path, validates it's an Obsidian vault (has `.obsidian/` dir)
- Creates `~/.vault-mind/config.json`
- Registers vault as a QMD collection: `qmd collection add <path> --name <vault-name>`
- Adds context: `qmd context add qmd://<vault-name> "Personal Obsidian knowledge base"`
- Runs initial embedding: `qmd embed`
- Checks if Obsidian CLI is available (`obsidian --version`)

### 2. `vault-mind search <query>`

```bash
vault-mind search "authentication patterns"
vault-mind search "auth" --mode keyword     # BM25 only
vault-mind search "auth" --mode semantic    # vector only
vault-mind search "auth" --mode hybrid      # full pipeline (default)
vault-mind search "auth" -n 10 --json
```

- Thin wrapper around QMD with nicer formatting
- Maps `--mode` to `qmd search` / `qmd vsearch` / `qmd query`
- Displays results with score, filepath, snippet, and context

### 3. `vault-mind ask <question>`

```bash
vault-mind ask "what are my main project threads right now?"
vault-mind ask "summarize everything I know about React Server Components"
vault-mind ask "what notes should I revisit?" --recent 30d
```

- Single-turn agent interaction
- Uses Claude Agent SDK `query()` with:
  - Custom MCP tools for QMD search and vault access
  - System prompt scoped to the question type
  - `permissionMode: "bypassPermissions"` (read-only tools)
  - `allowedTools`: limited to Read, Grep, Glob + custom MCP tools
- Agent searches vault via QMD, reads relevant notes, synthesizes answer

### 4. `vault-mind chat`

```bash
vault-mind chat
vault-mind chat --context "projects/current-sprint.md"
```

- Multi-turn interactive session using Agent SDK V2 `createSession()`
- Maintains conversation history across turns
- Agent has full tool access to search and read vault
- Can be pre-seeded with context from a specific note

### 5. `vault-mind link-suggest <file>`

```bash
vault-mind link-suggest ./notes/new-idea.md
vault-mind link-suggest ./notes/new-idea.md --apply  # auto-insert links
```

- Reads the target note
- Uses QMD semantic search to find related notes
- Uses Obsidian CLI to get existing link graph
- Agent suggests [[wikilinks]] that should be added
- With `--apply`, writes the updated file

### 6. `vault-mind index`

```bash
vault-mind index              # re-index and re-embed
vault-mind index --update     # incremental (QMD handles this)
vault-mind index --status     # show index health
```

- Wraps `qmd update` and `qmd embed`
- Shows stats: notes indexed, embeddings generated, collection health

---

## Agent Architecture Details

### MCP Tool Definitions

Using the Agent SDK's `tool()` helper and `createSdkMcpServer()`:

```typescript
// src/agent/tools.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod"; // Agent SDK uses zod for schemas

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
    // Spawn qmd process, parse JSON output
    const cmd = args.mode === "keyword" ? "search"
              : args.mode === "semantic" ? "vsearch"
              : "query";
    const result = await $`qmd ${cmd} ${args.query} -n ${args.limit} --min-score ${args.min_score} --json`;
    return { type: "text", text: result.stdout };
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
    return { type: "text", text: result.stdout };
  }
);

export const obsidianEvalTool = tool(
  "obsidian_eval",
  "Execute JavaScript inside the running Obsidian app. Has access to app.vault, app.metadataCache, and all plugin APIs. Use for metadata queries, link graph traversal, and vault-wide operations.",
  {
    code: z.string().describe("JavaScript code to execute in Obsidian"),
  },
  async (args) => {
    const result = await $`obsidian eval code=${JSON.stringify(args.code)}`;
    return { type: "text", text: result.stdout };
  }
);

export const vaultMcpServer = createSdkMcpServer({
  name: "vault-mind",
  version: "0.1.0",
  tools: [qmdSearchTool, qmdGetTool, obsidianEvalTool],
});
```

### Sub-Agent Definitions

```typescript
// src/agent/sub-agents.ts
export const agents = {
  researcher: {
    description: "Deep-dives into the vault to find and synthesize information on a topic",
    tools: ["qmd_search", "qmd_get", "Read", "Grep"],
    prompt: `You are a research assistant with access to a personal knowledge base.
Your job is to thoroughly search the vault, read relevant notes, and synthesize findings.
Always cite which notes your information comes from using [[wikilinks]].
Prefer QMD hybrid search (qmd_search with mode=hybrid) for best results.`,
    model: "sonnet" as const,
  },
  linker: {
    description: "Analyzes a note and suggests relevant connections",
    tools: ["qmd_search", "qmd_get", "obsidian_eval"],
    prompt: `You are a knowledge graph assistant. Given a note, find related notes
in the vault and suggest [[wikilinks]] that would strengthen the knowledge graph.
Use semantic search to find conceptually related notes, not just keyword matches.
Use obsidian_eval to check existing backlinks and avoid duplicates.`,
    model: "haiku" as const,
  },
};
```

### Agent Engine

```typescript
// src/agent/engine.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { vaultMcpServer } from "./tools";
import { agents } from "./sub-agents";

export async function ask(prompt: string, options: AskOptions) {
  for await (const message of query({
    prompt,
    options: {
      model: "sonnet",
      systemPrompt: buildSystemPrompt(options),
      mcpServers: { "vault-mind": vaultMcpServer },
      agents,
      allowedTools: [
        "Read", "Glob", "Grep",  // built-in file tools
        "qmd_search", "qmd_get", "obsidian_eval",  // custom MCP tools
      ],
      permissionMode: "bypassPermissions",
      maxTurns: 25,
    },
  })) {
    if (message.type === "assistant") {
      process.stdout.write(message.content);
    }
  }
}
```

---

## Configuration

### `~/.vault-mind/config.json`

```json
{
  "vaults": {
    "main": {
      "path": "/Users/allen/Obsidian/MainVault",
      "qmd_collection": "main-vault",
      "obsidian_cli": true
    }
  },
  "defaults": {
    "vault": "main",
    "model": "sonnet",
    "search_mode": "hybrid",
    "search_results": 10
  },
  "agent": {
    "max_turns": 25,
    "permission_mode": "bypassPermissions"
  }
}
```

---

## Implementation Plan (Phased)

### Phase 1: Foundation (Days 1–2)

- [ ] Project scaffolding: `bun init`, tsconfig, package.json
- [ ] Config system: load/save `~/.vault-mind/config.json`
- [ ] QMD wrapper (`src/integrations/qmd.ts`):
  - Spawn `qmd` process, capture stdout, parse JSON
  - Methods: `search()`, `vsearch()`, `query()`, `get()`, `multiGet()`, `status()`
- [ ] Obsidian CLI wrapper (`src/integrations/obsidian-cli.ts`):
  - `eval()`, `isAvailable()`, `listFiles()`, `getMetadata()`
  - Graceful fallback when Obsidian isn't running
- [ ] Vault filesystem wrapper (`src/integrations/vault-fs.ts`):
  - `readNote()`, `writeNote()`, `listNotes()`, `parseFrontmatter()`
- [ ] CLI skeleton with `commander`:
  - `init`, `search`, `index` commands (non-agent commands first)

### Phase 2: Agent Integration (Days 3–4)

- [ ] Install and configure Agent SDK
- [ ] Define MCP tools (`src/agent/tools.ts`)
- [ ] Build agent engine (`src/agent/engine.ts`)
- [ ] Write system prompts for each command mode
- [ ] Implement `ask` command (single-turn)
- [ ] Implement `chat` command (multi-turn with V2 sessions)
- [ ] Test agent tool calling end-to-end

### Phase 3: Smart Features (Days 5–6)

- [ ] `link-suggest` command with semantic search + agent analysis
- [ ] `review` command — surface recent changes, suggest actions
- [ ] Sub-agent definitions (researcher, linker)
- [ ] Output formatting (rich terminal output with colors, scores)

### Phase 4: Polish (Day 7)

- [ ] Error handling and graceful degradation
- [ ] `--help` text for all commands
- [ ] README with setup instructions
- [ ] CLAUDE.md for agent context
- [ ] Basic test coverage for integration wrappers

---

## Key Design Decisions

### Why QMD over rolling our own embeddings?

QMD already solves the hard problems: chunking (800-token, 15% overlap), hybrid retrieval with BM25+vector+reranking, SQLite+sqlite-vec storage, and Bun-native execution. It has MCP server support and structured output formats. Building this from scratch would be weeks of work. QMD is the right abstraction layer — we consume it as a CLI tool and wrap it with MCP tools for the agent.

### Why Obsidian CLI over direct filesystem access?

Obsidian 1.12's `obsidian eval` is a game-changer. Instead of parsing thousands of markdown files to build a link graph, we can query Obsidian's in-memory metadata cache in a single call. This is orders of magnitude more efficient in both tokens and time. Direct filesystem access remains as a fallback for when Obsidian isn't running.

### Why Agent SDK over raw Anthropic API?

The Agent SDK provides the agentic loop, built-in file tools, MCP server integration, sub-agents, and session management for free. Using the raw API means reimplementing all of that. The SDK also gives us `permissionMode` control and `maxTurns` limits for safety.

### Why not an Obsidian plugin?

This is a CLI tool, not a plugin. It runs in the terminal alongside your development workflow and integrates with Claude Code. An Obsidian plugin would be locked into the Obsidian UI. The CLI can be composed with other tools, piped, scripted, and used by agents.

---

## Future Considerations (Post-MVP)

- **Watch mode**: File watcher that auto-indexes new/changed notes and triggers re-embedding
- **Daily digest**: Cron job that generates a "daily review" note summarizing recent activity
- **Graph analysis**: Use Obsidian's link graph to find orphaned notes, dead links, clusters
- **Templates**: Agent-generated note templates based on vault patterns
- **Sync with QMD MCP HTTP server**: Long-lived daemon mode for faster repeated queries
- **Export**: Generate reports, summaries, or presentations from vault subsets
- **Multi-vault**: Support multiple vaults with cross-vault search

---

## Notes for the Implementing Agent

1. **Start with the integrations layer** — get QMD and Obsidian CLI wrappers working first with tests. Everything else depends on reliable subprocess execution and JSON parsing.

2. **Use Bun's shell** (`Bun.spawn` or `bun:shell` `$` tagged template) for subprocess management. It's cleaner than Node's `child_process`.

3. **QMD's `--json` flag** is your best friend. All QMD commands support it and return structured data. Parse with `JSON.parse()` — no scraping needed.

4. **Obsidian CLI availability** should be checked at runtime, not assumed. Build the fallback path from day one.

5. **The Agent SDK's `tool()` helper** uses Zod schemas. Keep tool definitions clean and well-documented — the descriptions are what the agent sees.

6. **System prompts** should include vault-specific context: collection name, number of notes, key folders, active tags. Populate this from `qmd status` and vault config.

7. **Stream output** from the agent to the terminal. Don't buffer the entire response. The Agent SDK returns an async generator — consume it incrementally.

8. **CLAUDE.md** in the project root should describe the project architecture and conventions for when Claude Code itself works on this codebase.
