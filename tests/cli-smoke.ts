#!/usr/bin/env bun
/**
 * CLI smoke tests — runs the actual CLI binary and checks output.
 * Run: bun run test:cli
 */

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  ${GREEN}✓${RESET} ${name}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}

function fail(name: string, err: unknown) {
  failed++;
  console.log(`  ${RED}✗${RESET} ${name}`);
  console.log(`    ${RED}${err instanceof Error ? err.message : String(err)}${RESET}`);
}

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, RA_DEV: "1" },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// ── Help ──

console.log(`\n${BOLD}CLI Help${RESET}`);

try {
  const { stdout, exitCode } = await runCli(["--help"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("ra")) throw new Error("Missing 'ra' in help output");
  if (!stdout.includes("search")) throw new Error("Missing 'search' command");
  if (!stdout.includes("index")) throw new Error("Missing 'index' command");
  if (!stdout.includes("init")) throw new Error("Missing 'init' command");
  if (!stdout.includes("ask")) throw new Error("Missing 'ask' command");
  if (!stdout.includes("chat")) throw new Error("Missing 'chat' command");
  if (!stdout.includes("link-suggest")) throw new Error("Missing 'link-suggest' command");
  if (!stdout.includes("review")) throw new Error("Missing 'review' command");
  ok("ra --help", "lists all commands");
} catch (e) { fail("ra --help", e); }

try {
  const { stdout, exitCode } = await runCli(["--version"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("0.1.0")) throw new Error(`Unexpected version: ${stdout}`);
  ok("ra --version", stdout);
} catch (e) { fail("ra --version", e); }

try {
  const { stdout, exitCode } = await runCli(["search", "--help"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("--mode")) throw new Error("Missing --mode option");
  if (!stdout.includes("--limit")) throw new Error("Missing --limit option");
  ok("ra search --help", "shows options");
} catch (e) { fail("ra search --help", e); }

try {
  const { stdout, exitCode } = await runCli(["index", "--help"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("--update")) throw new Error("Missing --update option");
  if (!stdout.includes("--status")) throw new Error("Missing --status option");
  ok("ra index --help", "shows options");
} catch (e) { fail("ra index --help", e); }

try {
  const { stdout, exitCode } = await runCli(["ask", "--help"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("--model")) throw new Error("Missing --model option");
  if (!stdout.includes("--max-turns")) throw new Error("Missing --max-turns option");
  ok("ra ask --help", "shows options");
} catch (e) { fail("ra ask --help", e); }

try {
  const { stdout, exitCode } = await runCli(["chat", "--help"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("--model")) throw new Error("Missing --model option");
  if (!stdout.includes("--context")) throw new Error("Missing --context option");
  ok("ra chat --help", "shows options");
} catch (e) { fail("ra chat --help", e); }

try {
  const { stdout, exitCode } = await runCli(["link-suggest", "--help"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("--apply")) throw new Error("Missing --apply option");
  if (!stdout.includes("--model")) throw new Error("Missing --model option");
  ok("ra link-suggest --help", "shows options");
} catch (e) { fail("ra link-suggest --help", e); }

try {
  const { stdout, exitCode } = await runCli(["review", "--help"]);
  if (exitCode !== 0) throw new Error(`Exit code ${exitCode}`);
  if (!stdout.includes("--recent")) throw new Error("Missing --recent option");
  if (!stdout.includes("--model")) throw new Error("Missing --model option");
  ok("ra review --help", "shows options");
} catch (e) { fail("ra review --help", e); }

// ── Dev Mode Config Bypass ──

console.log(`\n${BOLD}Dev Mode Config Bypass${RESET}`);

try {
  // search should NOT exit with "run ra init first" — it should try to run QMD
  const { stderr, exitCode } = await runCli(["search", "typescript"]);
  const output = stderr.toLowerCase();
  if (output.includes("run 'ra init") || output.includes("no configuration found")) {
    throw new Error("Search bailed with 'run ra init' — dev mode not working");
  }
  // It's OK if it fails because QMD isn't installed — that's a different error
  ok("ra search bypasses init check", exitCode === 0 ? "search succeeded" : "failed at QMD (expected)");
} catch (e) { fail("ra search bypasses init check", e); }

try {
  const { stderr, exitCode } = await runCli(["index", "--status"]);
  const output = stderr.toLowerCase();
  if (output.includes("run 'ra init") || output.includes("no configuration found")) {
    throw new Error("Index bailed with 'run ra init' — dev mode not working");
  }
  ok("ra index --status bypasses init check", exitCode === 0 ? "status succeeded" : "failed at QMD (expected)");
} catch (e) { fail("ra index --status bypasses init check", e); }

// ── Init Validates Vault ──

console.log(`\n${BOLD}Init Validation${RESET}`);

try {
  const { stderr, exitCode } = await runCli(["init", "/tmp/nonexistent-vault"]);
  if (exitCode === 0) throw new Error("init should fail for non-vault directory");
  if (!stderr.includes("Not an Obsidian vault")) throw new Error(`Unexpected error: ${stderr}`);
  ok("ra init rejects non-vault path");
} catch (e) { fail("ra init rejects non-vault path", e); }

try {
  // init with test-vault should get past validation (may fail at QMD)
  const { stderr, exitCode } = await runCli(["init", "./test-vault"]);
  if (stderr.includes("Not an Obsidian vault")) {
    throw new Error("init rejected test-vault as non-vault");
  }
  ok("ra init accepts test-vault", exitCode === 0 ? "full init succeeded" : "passed validation (QMD may be missing)");
} catch (e) { fail("ra init accepts test-vault", e); }

// ── Summary ──

console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}${failed > 0 ? `, ${RED}${failed} failed${RESET}` : ""}${BOLD} (${passed + failed} total)${RESET}\n`);

if (failed > 0) process.exit(1);
