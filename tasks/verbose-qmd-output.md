# Task: Pipe qmd stderr through in --verbose mode

## Problem

When running `ra search`, the qmd subprocess produces useful progress output on stderr — model download progress, search stage info, warnings, etc. — but it's all silently swallowed. Users have no visibility into what's happening, making it look like the command is hanging (especially on first run when models need to download).

Example qmd stderr output that should be visible:

```
├─ typescript
├─ lex: typescript basics
├─ lex: typescript guide
├─ vec: beginner guide to typescript
├─ vec: how to get started with typescript
└─ hyde: This guide covers the basics of typescript...
Searching 6 queries...
QMD Warning: no GPU acceleration, running on CPU (slow). Run 'qmd status' for details.
Reranking 13 chunks...
⠋ Gathering information
Downloading to ~/.cache/qmd/models
⏵ hf_ggml-o...8_0.gguf  74.64% (477.12MB/639.15MB)  1.64kB/s
✔ hf_ggml-o...8_0.gguf downloaded 639.15MB in 2s
```

## Plan

### 1. Add `isVerbose()` getter to `src/utils/logger.ts`

Export a function so other modules can check the current verbose state without importing the private `verbose` variable:

```ts
export function isVerbose(): boolean {
  return verbose;
}
```

### 2. Update `run()` in `src/integrations/qmd.ts`

- Import `isVerbose` from the logger.
- When verbose is **on**: set `stderr: "inherit"` so qmd output streams directly to the terminal in real-time.
- When verbose is **off**: keep `stderr: "pipe"` and consume it (for error reporting only).

```ts
import { isVerbose } from "../utils/logger.ts";

async function run(args: string[]): Promise<{ stdout: string; exitCode: number }> {
  const passthrough = isVerbose();

  const proc = Bun.spawn(["node", QMD_ENTRY, ...args], {
    stdout: "pipe",
    stderr: passthrough ? "inherit" : "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    passthrough ? Promise.resolve("") : new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`qmd ${args.join(" ")} failed (exit ${exitCode}): ${stderr}`);
  }

  return { stdout: stdout.trim(), exitCode };
}
```

### 3. No changes needed to CLI wiring

The `-v, --verbose` flag and `preAction` hook in `src/index.ts` already call `setVerbose(true)` before any command action runs, so the plumbing is already in place.

## Testing

```sh
# Should show qmd progress/search stages on stderr
bun run src/index.ts -v search "typescript"

# Should stay quiet (no qmd stderr output)
bun run src/index.ts search "typescript"
```

## Files to modify

- `src/utils/logger.ts` — add `isVerbose()` export
- `src/integrations/qmd.ts` — conditional stderr handling in `run()`
