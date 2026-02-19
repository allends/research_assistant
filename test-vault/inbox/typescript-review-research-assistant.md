---
title: TypeScript Review — research-assistant
tags: [code-review, typescript, research-assistant, todo]
created: 2026-02-19
source: Mira (AI review)
---

# TypeScript Review — research-assistant

Reviewed the full codebase on 2026-02-19. Overall score: **6/10** — solid foundation with a few targeted fixes that would make it significantly safer.

## 🔴 High Priority

### 1. `AgentEvent` should be a discriminated union
`packages/core/src/types/api.ts` — currently a flat interface with all optional fields, causing non-null assertions downstream (`event.text!` in `ask.ts`).

**Fix:** Replace with a proper discriminated union:
```typescript
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; toolName: string; toolInput: Record<string, unknown> }
  | { type: "tool_end"; toolName: string; toolResult: string }
  | { type: "error"; error: string }
  | { type: "done"; sessionId?: string };
```

### 2. `Record<string, any>` in `chatStream`
`packages/core/src/agent/engine.ts` — `queryOptions` typed as `Record<string, any>` to allow conditional `resume` field. Throws away all type safety.

**Fix:**
```typescript
const queryOptions = {
  model,
  ...(sessionId ? { resume: sessionId } : {}),
};
```

### 3. `permission_mode` typed as `string`
`packages/core/src/types/config.ts` — should be a literal union:
```typescript
permission_mode: "bypassPermissions" | "default" | "acceptEdits";
```

## 🟡 Medium Priority

### 4. Server routes redefine request types inline
Routes like `routes/ask.ts` inline their own request types instead of importing `AskRequest` from `api.ts`. Can silently diverge.

**Fix:** Use the shared types: `await c.req.json<AskRequest>()`

### 5. Duplicate `parseFrontmatter` + `extractWikilinks`
Both `utils/markdown.ts` and `integrations/vault-fs.ts` export identical implementations of both functions. One should import from the other.

### 6. No runtime validation on external data
`JSON.parse(...) as T` in `parseJsonOutput()` and config loading are type casts only — no runtime safety. Zod is already a dep; use it for config at minimum.

### 7. `maxTurns` option typed as `string` in CLI
Commander can handle this with `.argParser(Number)` so the option arrives as `number | undefined` rather than needing a manual `parseInt`.

## 🟢 Minor

### 8. Dead empty try/catch in `chat.ts`
Remove or implement the auth pre-check.

### 9. CORS wildcard bug
`http://localhost:*` is not a valid CORS glob. Use a function origin check instead.

### 10. `options.folder!` non-null assertion in `tools.ts`
Extract to a variable first to let TypeScript narrow it naturally.

## Score Breakdown

| Area | Score |
|------|-------|
| Type coverage | 7/10 |
| Discriminated unions / narrowing | 5/10 |
| Shared types / DRY | 6/10 |
| Runtime validation | 4/10 |
| **Overall** | **6/10** |

## Next Steps

- [ ] Fix `AgentEvent` → discriminated union (highest leverage)
- [ ] Fix `chatStream` `Record<string, any>` escape hatch
- [ ] Tighten `AgentConfig.permission_mode` to literal union
- [ ] Import `AskRequest`/`ChatRequest` etc. in server routes
- [ ] De-dupe `parseFrontmatter` + `extractWikilinks`
- [ ] Add Zod validation for config loading
