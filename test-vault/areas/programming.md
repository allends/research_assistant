---
title: Programming
tags:
  - area
  - programming
created: 2025-06-01
modified: 2026-02-11
---

# Programming

An area for general programming knowledge, language-specific notes, and development practices.

## Active Languages

### TypeScript

My primary language. Used in [[research-assistant]], web projects, and scripting with Bun.

Key resources:
- [[typescript-patterns]] — idioms and patterns I use
- Official handbook: strict mode, generics, utility types

### Python

Used for data analysis, ML experiments, and quick scripting.

### Rust

Learning phase. Interested in systems programming and CLI tools.

## Development Practices

### Testing Strategy

- Unit tests for pure functions (use `bun:test`)
- Integration tests for subprocess wrappers
- Keep tests close to source (`*.test.ts` next to `*.ts`)

### Code Organization

Prefer flat structures over deep nesting. Group by feature, not by type.

```
src/
  commands/     # CLI command handlers
  integrations/ # External tool wrappers
  utils/        # Shared utilities
  types/        # TypeScript type definitions
```

This is the pattern used in [[research-assistant]].

### Tools

- **Runtime:** Bun (replaces Node.js for most projects)
- **Editor:** VS Code + Vim keybindings
- **Version Control:** Git + GitHub
- **AI:** Claude Code for pair programming

## Topics to Explore

- [ ] WebAssembly for performance-critical code
- [ ] Effect-TS for functional error handling
- [ ] SQLite as an application database (see [[vector-search]] for embedding storage)

#area #programming #learning
