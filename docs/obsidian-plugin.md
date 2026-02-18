# Obsidian Plugin for Research Assistant

Build an Obsidian plugin that brings `ra` directly into the editor — search, ask, chat, link-suggest, and review without leaving Obsidian.

## Goal

Replace the CLI workflow (`bun run ra ask "..."`) with native Obsidian UI: a chat panel, command palette actions, and inline suggestions. The user authenticates once with their Claude API key or Max subscription token, and everything works inside the editor.

## Architecture

```
obsidian-research-assistant/
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  src/
    main.ts                — Plugin lifecycle (onload/onunload)
    settings.ts            — Settings tab (API key, model, max turns)
    views/
      chat-view.ts         — Right-panel chat view (ItemView)
      results-modal.ts     — Search results modal
    services/
      agent.ts             — Claude Agent SDK integration (query/resume)
      qmd.ts               — QMD subprocess bridge (reuse existing logic)
      vault-adapter.ts     — Obsidian Vault API adapter (replaces vault-fs)
    commands/
      ask.ts               — "Ask about vault" command
      search.ts            — "Search vault" command
      link-suggest.ts      — "Suggest links for current note" command
      review.ts            — "Review recent changes" command
    utils/
      markdown-renderer.ts — Render agent output as Obsidian markdown
  styles.css
```

## Authentication

The plugin settings tab stores credentials in Obsidian's `data.json` (plugin data):

```typescript
interface RASettings {
  authMethod: "api-key" | "oauth-token";
  anthropicApiKey: string;    // encrypted at rest via Obsidian's plugin data
  oauthToken: string;         // alternative: Max subscription token
  model: string;              // default: "claude-sonnet-4-6"
  maxTurns: number;           // default: 25
  searchMode: "hybrid" | "keyword" | "semantic";
}
```

On plugin load, inject the chosen credential into `process.env` so the Agent SDK picks it up:

```typescript
if (settings.authMethod === "api-key") {
  process.env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
} else {
  process.env.CLAUDE_CODE_OAUTH_TOKEN = settings.oauthToken;
}
```

## Key Components

### 1. Settings Tab

Standard Obsidian `PluginSettingTab`:
- **Auth method** toggle (API key vs. OAuth token)
- **API key / token** password input field
- **Model** dropdown (sonnet-4-6, opus-4-6, haiku-4-5)
- **Max agent turns** slider (5–50, default 25)
- **Search mode** dropdown (hybrid, keyword, semantic)
- Validate credentials on save with a lightweight API ping

### 2. Chat Panel (ItemView)

A persistent right-side panel (`VIEW_TYPE_RA_CHAT`):
- Input box at bottom, messages above (standard chat layout)
- Messages render as Obsidian markdown (supports `[[wikilinks]]`, code blocks, etc.)
- Shows tool-use activity inline (e.g., "Searching vault..." with a spinner)
- Session persists across panel toggles (uses Agent SDK `resume: sessionId`)
- "New conversation" button to reset
- Optional: right-click a note in the file explorer to "Ask about this note" — opens chat with context pre-seeded

### 3. Command Palette Actions

Register these commands via `this.addCommand()`:

| Command | ID | Action |
|---|---|---|
| Ask about vault | `ra:ask` | Prompt modal → single-turn answer in a notice or modal |
| Search vault | `ra:search` | Prompt modal → results modal with clickable note links |
| Suggest links | `ra:link-suggest` | Runs on active note → shows suggestions in a modal, apply button inserts links |
| Review changes | `ra:review` | Runs review on recent vault changes → output in chat panel |
| Open chat | `ra:chat` | Toggle the chat panel |
| Re-index vault | `ra:index` | Trigger QMD re-index, show progress notice |

### 4. Vault Adapter (replaces `vault-fs.ts`)

Instead of direct filesystem access, use Obsidian's `Vault` API:

```typescript
class ObsidianVaultAdapter {
  constructor(private vault: Vault) {}

  async listNotes(folder?: string): Promise<string[]> {
    return this.vault.getMarkdownFiles()
      .filter(f => !folder || f.path.startsWith(folder))
      .map(f => f.path);
  }

  async readNote(path: string): Promise<{ path: string; body: string; frontmatter: any }> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Not found: ${path}`);
    const content = await this.vault.read(file);
    // parse frontmatter with gray-matter or Obsidian's metadataCache
    return { path, body: content, frontmatter: {} };
  }

  async writeNote(path: string, content: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.modify(file, content);
    } else {
      await this.vault.create(path, content);
    }
  }
}
```

### 5. QMD Bridge

QMD must run as a subprocess (it needs Node, not the Electron renderer). The plugin spawns it the same way the CLI does — via `child_process.execFile("node", ...)`. The vault path comes from `this.app.vault.adapter.basePath`.

Key concern: Obsidian plugins run in the renderer process. Spawning subprocesses works on desktop Obsidian but not mobile. This is desktop-only.

### 6. Agent Service

Wraps the Agent SDK's `query()` for use in the plugin:

```typescript
class AgentService {
  private sessionId?: string;
  private mcpServer: any;

  constructor(private settings: RASettings, private vaultPath: string) {
    this.mcpServer = createVaultMcpServer(vaultPath);
  }

  async ask(prompt: string, onChunk: (text: string) => void): Promise<void> {
    const conversation = query({
      prompt,
      options: {
        model: this.settings.model,
        systemPrompt: "...",
        mcpServers: { vault: this.mcpServer },
        allowedTools: VAULT_TOOLS,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: this.settings.maxTurns,
        cwd: this.vaultPath,
      },
    });

    for await (const message of conversation) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text") onChunk(block.text);
        }
      }
      if (message.type === "result" && message.subtype === "success") {
        this.sessionId = message.session_id;
      }
    }
  }

  async chat(prompt: string, onChunk: (text: string) => void): Promise<void> {
    // Same as ask but passes `resume: this.sessionId` for multi-turn
  }

  resetSession() {
    this.sessionId = undefined;
  }
}
```

## Build Setup

Obsidian plugins must ship a single `main.js` bundle (CommonJS). Use the standard esbuild config from the Obsidian sample plugin:

```json
{
  "devDependencies": {
    "obsidian": "latest",
    "esbuild": "^0.21.0",
    "@anthropic-ai/claude-agent-sdk": "^0.2.45",
    "@tobilu/qmd": "^1.0.6",
    "zod": "^4.3.6",
    "gray-matter": "^4.0.3"
  }
}
```

The Agent SDK and QMD get bundled into `main.js`. QMD's Node subprocess call uses the system `node` binary.

## Development Workflow

1. Scaffold from the [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) template
2. Set up a symlink from the build output to `<test-vault>/.obsidian/plugins/research-assistant/`
3. `bun run dev` watches and rebuilds → hot-reload in Obsidian with the Hot Reload plugin

```sh
# Symlink for development
ln -s /path/to/obsidian-research-assistant \
  "/path/to/test-vault/.obsidian/plugins/research-assistant"
```

## Implementation Phases

### Phase 1: Scaffold + Settings + Search

- [ ] Scaffold plugin from sample template
- [ ] Implement settings tab with auth fields
- [ ] Port QMD bridge (subprocess spawning)
- [ ] Implement `ra:search` command — prompt modal, results modal with clickable links
- [ ] Implement `ra:index` command — re-index with progress notice

### Phase 2: Ask + Chat Panel

- [ ] Build `AgentService` wrapping the Agent SDK
- [ ] Implement `ra:ask` command — prompt modal, render answer
- [ ] Build chat panel (`ItemView`) with streaming output
- [ ] Support multi-turn sessions via `resume: sessionId`
- [ ] Render tool-use activity (search indicators, file reads)

### Phase 3: Link Suggest + Review

- [ ] Implement `ra:link-suggest` — run on active note, show modal with suggestions, apply button
- [ ] Implement `ra:review` — review recent changes, output to chat panel
- [ ] Add "Ask about this note" to file explorer context menu

### Phase 4: Polish

- [ ] Loading states and error handling throughout
- [ ] Keyboard shortcuts (e.g., `Cmd+Shift+R` for chat)
- [ ] Auto-index on vault changes (debounced, via Obsidian's `vault.on("modify")`)
- [ ] Style the chat panel to match Obsidian themes (CSS variables)
- [ ] Test with multiple vaults

## Constraints and Gotchas

- **Desktop only** — subprocess spawning doesn't work on Obsidian mobile
- **QMD needs Node** — same constraint as the CLI (`node` not `bun` for sqlite-vec)
- **Bundle size** — the Agent SDK + QMD dependencies will make the bundle non-trivial; consider lazy-loading the agent service
- **Obsidian API** — use `this.app.vault` instead of direct `fs` access so the plugin works with Obsidian's sync and conflict resolution
- **Rate limits** — surface rate-limit errors clearly in the UI; don't silently retry
- **process.env** — Obsidian's renderer process may not have `process.env` behave identically to Node; test credential injection carefully, may need to pass auth headers directly to the SDK instead

## Alternatives Considered

**Why not an MCP server that Obsidian connects to?** MCP servers are great for tool-providing, but the plugin needs to be the *client* that calls Claude. The plugin itself is the orchestrator.

**Why not use the Anthropic Messages API directly instead of the Agent SDK?** The Agent SDK handles the agentic loop (tool calls, multi-turn, session management). Reimplementing that is significant work with no benefit.

**Why not a web-based panel via iframe?** Obsidian's `ItemView` is more native, supports wikilink rendering, and avoids CSP/sandbox issues.
