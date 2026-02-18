#!/usr/bin/env bun
/**
 * Smoke tests for dev mode and test vault.
 * Run: bun run test:smoke
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

// ── Config & Dev Mode ──

console.log(`\n${BOLD}Config & Dev Mode${RESET}`);

import { isDevMode, getProjectRoot, configExists, loadConfig } from "../packages/cli/src/config.ts";

try {
  const dev = isDevMode();
  if (!dev) throw new Error(`Expected RA_DEV to be active, got ${dev}. Is .env loaded?`);
  ok("isDevMode() returns true");
} catch (e) { fail("isDevMode() returns true", e); }

try {
  const root = getProjectRoot();
  if (!root.endsWith("packages/cli")) throw new Error(`Unexpected root: ${root}`);
  ok("getProjectRoot()", root);
} catch (e) { fail("getProjectRoot()", e); }

try {
  const exists = configExists();
  if (!exists) throw new Error("configExists() returned false in dev mode");
  ok("configExists() returns true in dev mode");
} catch (e) { fail("configExists() returns true in dev mode", e); }

try {
  const config = await loadConfig();
  if (!config.vault.path.includes("test-vault")) {
    throw new Error(`Expected vault.path to contain 'test-vault', got: ${config.vault.path}`);
  }
  if (config.vault.qmd_collection !== "test-vault") {
    throw new Error(`Expected qmd_collection='test-vault', got: ${config.vault.qmd_collection}`);
  }
  if (config.vault.obsidian_cli !== false) {
    throw new Error(`Expected obsidian_cli=false, got: ${config.vault.obsidian_cli}`);
  }
  ok("loadConfig() returns dev config", `vault=${config.vault.path}`);
} catch (e) { fail("loadConfig() returns dev config", e); }

// ── Vault Filesystem ──

console.log(`\n${BOLD}Vault Filesystem${RESET}`);

import { vaultFs, extractWikilinks, extractTags, extractHeadings } from "../packages/core/src/index.ts";
import { join } from "path";

const vaultPath = join(getProjectRoot(), "../../test-vault");

try {
  const valid = vaultFs.isObsidianVault(vaultPath);
  if (!valid) throw new Error("isObsidianVault returned false");
  ok("isObsidianVault(test-vault)");
} catch (e) { fail("isObsidianVault(test-vault)", e); }

try {
  const notes = await vaultFs.listNotes(vaultPath);
  if (notes.length !== 13) throw new Error(`Expected 13 notes, got ${notes.length}: ${notes.join(", ")}`);
  ok("listNotes() returns 13 notes", notes.join(", "));
} catch (e) { fail("listNotes() returns 13 notes", e); }

try {
  const stats = await vaultFs.getVaultStats(vaultPath);
  if (stats.totalNotes !== 13) throw new Error(`Expected 13 notes, got ${stats.totalNotes}`);
  if (stats.totalFolders < 5) throw new Error(`Expected >= 5 folders, got ${stats.totalFolders}`);
  ok("getVaultStats()", `${stats.totalNotes} notes, ${stats.totalFolders} folders`);
} catch (e) { fail("getVaultStats()", e); }

try {
  const note = await vaultFs.readNote("projects/research-assistant.md", vaultPath);
  if (!note.frontmatter.title) throw new Error("Missing frontmatter title");
  if (!note.frontmatter.tags?.length) throw new Error("Missing frontmatter tags");
  if (!note.body.includes("[[")) throw new Error("No wikilinks found in body");
  ok("readNote() parses frontmatter + body", `title="${note.frontmatter.title}"`);
} catch (e) { fail("readNote() parses frontmatter + body", e); }

// ── Markdown Utilities ──

console.log(`\n${BOLD}Markdown Utilities${RESET}`);

try {
  const note = await vaultFs.readNote("projects/research-assistant.md", vaultPath);
  const links = extractWikilinks(note.content);
  if (links.length === 0) throw new Error("No wikilinks extracted");
  ok("extractWikilinks()", `[${links.join(", ")}]`);
} catch (e) { fail("extractWikilinks()", e); }

try {
  const note = await vaultFs.readNote("projects/research-assistant.md", vaultPath);
  const tags = extractTags(note.body);
  if (tags.length === 0) throw new Error("No inline tags found");
  ok("extractTags()", `[${tags.join(", ")}]`);
} catch (e) { fail("extractTags()", e); }

try {
  const note = await vaultFs.readNote("references/vector-search.md", vaultPath);
  const headings = extractHeadings(note.body);
  if (headings.length < 3) throw new Error(`Expected >= 3 headings, got ${headings.length}`);
  ok("extractHeadings()", `${headings.length} headings`);
} catch (e) { fail("extractHeadings()", e); }

// ── Cross-links Between Folders ──

console.log(`\n${BOLD}Cross-Links${RESET}`);

try {
  const notes = await vaultFs.listNotes(vaultPath);
  const linkMap: Record<string, string[]> = {};
  for (const notePath of notes) {
    const note = await vaultFs.readNote(notePath, vaultPath);
    linkMap[notePath] = extractWikilinks(note.content);
  }

  // Check that notes link across folders
  const crossLinks = Object.entries(linkMap).filter(([path, links]) => {
    const folder = path.split("/")[0];
    return links.some((link) => {
      // Find a note in a different folder that matches this link
      return notes.some(
        (n) => !n.startsWith(folder!) && n.includes(link.toLowerCase().replace(/ /g, "-")),
      );
    });
  });

  if (crossLinks.length < 5) {
    throw new Error(`Expected >= 5 notes with cross-folder links, got ${crossLinks.length}`);
  }
  ok("Cross-folder wikilinks present", `${crossLinks.length} notes link across folders`);
} catch (e) { fail("Cross-folder wikilinks present", e); }

// ── All Notes Have Frontmatter ──

console.log(`\n${BOLD}Frontmatter Completeness${RESET}`);

try {
  const notes = await vaultFs.listNotes(vaultPath);
  const issues: string[] = [];
  for (const notePath of notes) {
    const note = await vaultFs.readNote(notePath, vaultPath);
    if (!note.frontmatter.title) issues.push(`${notePath}: missing title`);
    if (!note.frontmatter.tags?.length) issues.push(`${notePath}: missing tags`);
    if (!note.frontmatter.created) issues.push(`${notePath}: missing created`);
  }
  if (issues.length > 0) throw new Error(`Frontmatter issues:\n    ${issues.join("\n    ")}`);
  ok("All 13 notes have title, tags, created");
} catch (e) { fail("All 13 notes have title, tags, created", e); }

// ── Summary ──

console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}${failed > 0 ? `, ${RED}${failed} failed${RESET}` : ""}${BOLD} (${passed + failed} total)${RESET}\n`);

if (failed > 0) process.exit(1);
