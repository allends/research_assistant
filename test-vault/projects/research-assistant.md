---
title: Research Assistant
tags:
  - project
  - typescript
  - ai
status: active
created: 2026-02-01
modified: 2026-02-12
---

# Research Assistant

A CLI tool for intelligent knowledge management over an [[Obsidian]] vault. Built with [[TypeScript Patterns|TypeScript]], Bun, and the Claude Agent SDK.

## Goals

- Hybrid search over personal notes using QMD (BM25 + vector + re-ranking)
- AI-powered Q&A, summarization, and link suggestions
- Direct integration with Obsidian CLI (1.12+) for metadata and graph access
- Composable terminal-first workflow

## Architecture

The system has three integration layers:

1. **QMD** — handles indexing, embedding, and hybrid retrieval
2. **Obsidian CLI** — provides access to the running app's metadata cache and link graph
3. **Vault filesystem** — fallback for direct markdown reading/writing when Obsidian isn't running

See [[vector-search]] for notes on the embedding approach. The [[programming]] area has general TypeScript patterns used in this project.

## Status

Phase 1 (foundation) is complete. Working on #phase/2 agent integration next.

### Milestones

- [x] Project scaffolding and config system
- [x] QMD and Obsidian CLI wrappers
- [x] Vault filesystem fallback layer
- [x] CLI skeleton (init, search, index)
- [ ] Agent SDK integration
- [ ] `ask` and `chat` commands
- [ ] `link-suggest` command

## Tech Stack

- **Runtime:** Bun 1.3.9
- **Language:** TypeScript 5.9 (strict)
- **Search:** QMD with embeddinggemma-300M
- **Agent:** Claude Agent SDK v0.2
- **CLI:** Commander.js

#project/active #tools/cli
