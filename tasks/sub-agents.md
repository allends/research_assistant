# Task: Sub-agent definitions for specialized vault operations

## Overview

Define sub-agents that the main agent can delegate to via the `Task` tool in the Agent SDK. Sub-agents are specialized agents with scoped tool access and focused system prompts, enabling the main agent to parallelize work and delegate domain-specific tasks.

## Why sub-agents?

The main agent (used by `ra ask` and `ra chat`) is a generalist — it handles any question about the vault. But some operations benefit from a dedicated agent with a focused prompt and constrained toolset:

1. **Parallelism** — The main agent can dispatch multiple sub-agents simultaneously (e.g., search for related notes AND analyze the link graph at the same time).
2. **Context isolation** — Sub-agents get their own context window, preventing the main agent's context from filling up with intermediate search results.
3. **Specialization** — A focused system prompt produces better results for specific tasks (link analysis, deep research synthesis, etc.).

## Sub-agent definitions

### `researcher`

**Purpose:** Deep-dive search and synthesis across the vault. Given a topic, exhaustively searches the vault, reads relevant notes, and produces a structured synthesis with citations.

**Tools:** `qmd_search`, `qmd_get`, `vault_list`, `vault_read`

**System prompt guidance:**
- Perform multiple search queries with varied phrasing (synonyms, related concepts)
- Read the full content of top results, not just snippets
- Synthesize findings into a coherent summary with [[wikilink]] citations
- Note contradictions or gaps in the vault's coverage
- Prefer hybrid search mode for best recall

**Model:** `claude-sonnet-4-5` (needs good synthesis capability)

**Example delegations:**
- "Research everything in my vault about authentication patterns"
- "Find all notes that discuss project X and summarize the current status"
- "What does my vault say about topic Y? Be thorough."

### `linker`

**Purpose:** Analyze a note and suggest [[wikilinks]] to other notes in the vault. Uses semantic search to find conceptually related notes (not just keyword overlap) and checks existing backlinks to avoid duplicates.

**Tools:** `qmd_search`, `qmd_get`, `vault_list`, `vault_read`, `obsidian_eval`

**System prompt guidance:**
- Read the target note fully to understand its content and themes
- Extract key concepts, entities, and topics from the note
- Search for each concept/entity to find related notes
- Check existing wikilinks in the target note to avoid suggesting duplicates
- Use `obsidian_eval` (if available) to query backlinks and the metadata cache
- Rank suggestions by relevance: strong conceptual connections > weak keyword overlap
- Output format: list of `[[suggested-link]]` with a 1-line reason for each

**Model:** `claude-haiku-4-5` (simpler task, speed matters)

**Example delegations:**
- "Analyze this note and suggest wikilinks to related notes"
- "Find notes that should link to/from this one"

### `reviewer` (new)

**Purpose:** Review recent vault activity and surface actionable insights. Looks at recently modified notes, identifies patterns, and suggests follow-up actions (orphaned notes, stale projects, missing links, incomplete thoughts).

**Tools:** `qmd_search`, `vault_list`, `vault_read`

**System prompt guidance:**
- List recently modified notes (by file mtime)
- Read each recent note to understand what changed
- Identify patterns: abandoned threads, notes that need linking, incomplete sections
- Suggest concrete next actions (e.g., "Note X mentions Y but doesn't link to [[Z]]")
- Group insights by category: connections to make, notes to revisit, ideas to develop

**Model:** `claude-haiku-4-5` (structured output, speed over depth)

## Implementation

### File: `src/agent/sub-agents.ts`

Sub-agents are registered via the `agents` option in `query()`. The SDK uses the `Task` tool internally — when the main agent calls `Task`, the SDK routes to the matching sub-agent definition.

```typescript
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

export const agents: Record<string, AgentDefinition> = {
  researcher: {
    description: "Deep-dives into the vault to find and synthesize information on a topic",
    tools: [
      "mcp__vault__qmd_search",
      "mcp__vault__qmd_get",
      "mcp__vault__vault_list",
      "mcp__vault__vault_read",
    ],
    prompt: `You are a research agent with access to a personal knowledge base (Obsidian vault).
Your job is to thoroughly search the vault, read relevant notes, and synthesize findings.

Instructions:
- Run multiple search queries with varied phrasing to maximize recall
- Read full note content for top results, not just snippets
- Synthesize into a structured summary with [[wikilink]] citations
- Note any contradictions or gaps you find
- Use hybrid search mode for best results`,
    model: "claude-sonnet-4-5" as const,
  },
  linker: {
    description: "Analyzes a note and suggests relevant [[wikilink]] connections to other vault notes",
    tools: [
      "mcp__vault__qmd_search",
      "mcp__vault__qmd_get",
      "mcp__vault__vault_list",
      "mcp__vault__vault_read",
      "mcp__vault__obsidian_eval",
    ],
    prompt: `You are a knowledge graph agent. Given a note, find related notes in the vault and suggest [[wikilinks]] that would strengthen the knowledge graph.

Instructions:
- Read the target note to understand its themes and concepts
- Search for related notes using semantic search (not just keywords)
- Check existing wikilinks to avoid duplicate suggestions
- Rank by relevance: strong conceptual connections > weak keyword overlap
- Output: list of [[suggested-link]] with a 1-line reason for each`,
    model: "claude-haiku-4-5" as const,
  },
  reviewer: {
    description: "Reviews recent vault activity and surfaces actionable insights and follow-ups",
    tools: [
      "mcp__vault__qmd_search",
      "mcp__vault__vault_list",
      "mcp__vault__vault_read",
    ],
    prompt: `You are a vault review agent. Analyze recent vault activity and surface actionable insights.

Instructions:
- Read recently modified notes to understand what changed
- Identify patterns: abandoned threads, missing links, incomplete sections
- Suggest concrete next actions with specific note references
- Group insights by category: connections to make, notes to revisit, ideas to develop`,
    model: "claude-haiku-4-5" as const,
  },
};
```

### Wiring into the agent engine

Add `agents` to the `query()` options in `src/agent/engine.ts`, and add `"Task"` to `allowedTools`:

```typescript
import { agents } from "./sub-agents.ts";

// In query() options:
{
  agents,
  allowedTools: [...VAULT_TOOLS, "Task"],
}
```

### Dependencies

- Requires `"Task"` in `allowedTools` for the main agent to dispatch sub-agents
- Sub-agents inherit the same MCP server (vault tools) as the main agent
- No new dependencies needed — the Agent SDK handles sub-agent dispatch internally

## Testing

- Verify sub-agents are invoked by the main agent when appropriate (e.g., `ra ask "thoroughly research X in my vault"` should trigger the researcher sub-agent)
- Check that sub-agent results are incorporated into the main agent's response
- Test that `obsidian_eval` gracefully degrades in the linker sub-agent when Obsidian CLI is unavailable
