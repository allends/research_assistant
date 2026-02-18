---
title: TypeScript Patterns
tags:
  - reference
  - typescript
  - patterns
created: 2025-09-20
modified: 2026-02-10
---

# TypeScript Patterns

A collection of TypeScript patterns and idioms I use frequently.

## Discriminated Unions

Prefer discriminated unions over optional fields for representing variants:

```typescript
// Good
type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

// Avoid
type Result<T> = { ok: boolean; value?: T; error?: Error };
```

Used extensively in [[research-assistant]] for command result types.

## Branded Types

Use branded types for type-safe identifiers:

```typescript
type UserId = string & { readonly __brand: unique symbol };
type DocId = string & { readonly __brand: unique symbol };
```

## Builder Pattern with Method Chaining

```typescript
class QueryBuilder {
  private filters: Filter[] = [];

  where(filter: Filter): this {
    this.filters.push(filter);
    return this;
  }

  build(): Query {
    return { filters: this.filters };
  }
}
```

## Error Handling

Always use custom error classes for domain errors:

```typescript
class VaultError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "VaultError";
  }
}
```

## Async Patterns

### Bun.spawn for Subprocess Execution

```typescript
const proc = Bun.spawn(["qmd", "search", query, "--json"]);
const stdout = await new Response(proc.stdout).text();
const result = JSON.parse(stdout);
```

**Gotcha:** Always read stderr separately if you need error output. See daily note [[2026-02-10]] for the debugging story.

## Strict Mode Essentials

Always enable in `tsconfig.json`:
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

#reference #typescript #patterns
