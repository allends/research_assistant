---
title: Obsidian Plugin API
tags:
  - reference
  - obsidian
  - api
created: 2026-01-05
modified: 2026-02-11
---

# Obsidian Plugin API

Notes on the Obsidian API, especially the parts relevant to [[research-assistant]].

## Key Interfaces

### `app.vault`

- `getMarkdownFiles()` — returns all `.md` files as `TFile[]`
- `read(file: TFile)` — read file content
- `modify(file: TFile, data: string)` — write file content
- `create(path: string, data: string)` — create new file

### `app.metadataCache`

- `getFileCache(file: TFile)` — returns parsed frontmatter, headings, links, tags
- `resolvedLinks` — full link graph as `Record<string, Record<string, number>>`
- `on("resolved", callback)` — fires when cache is fully built

### `app.workspace`

- `getActiveFile()` — currently open file
- `openLinkText(link, source)` — navigate to a note

## Obsidian CLI (1.12+)

The CLI is an Early Access feature. Key commands:

```bash
obsidian eval code="app.vault.getMarkdownFiles().length"
obsidian files list --vault MyVault
obsidian files read --vault MyVault --path "notes/example.md"
obsidian search content "query" --vault MyVault
obsidian property:read --vault MyVault --property tags
```

### Caveats

- `eval` requires the Obsidian desktop app to be running
- Parameter parsing with colon-subcommands can be finicky
- The `dev:eval` variant is available in development mode

## Link Graph Traversal

Using `resolvedLinks` to find all notes linked from a given note:

```javascript
const links = app.metadataCache.resolvedLinks;
const outgoing = Object.keys(links["notes/my-note.md"] || {});
const incoming = Object.entries(links)
  .filter(([_, targets]) => "notes/my-note.md" in targets)
  .map(([source]) => source);
```

This is what [[research-assistant]] uses for the `link-suggest` command's existing link detection.

## Frontmatter Access

```javascript
const file = app.vault.getAbstractFileByPath("notes/example.md");
const cache = app.metadataCache.getFileCache(file);
const tags = cache?.frontmatter?.tags || [];
const title = cache?.frontmatter?.title || file.basename;
```

See also [[typescript-patterns]] for the TypeScript wrapper code.

#reference #obsidian #api
