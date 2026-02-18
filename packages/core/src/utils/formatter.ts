import type { QmdSearchResult } from "../types/search.ts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

export function formatSearchResults(results: QmdSearchResult[]): string {
  if (results.length === 0) {
    return `${DIM}No results found.${RESET}`;
  }

  const lines: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const rank = `${DIM}${String(i + 1).padStart(2)}.${RESET}`;
    const score = `${YELLOW}[${r.score.toFixed(3)}]${RESET}`;
    const path = `${CYAN}${r.file}${RESET}`;
    const title = r.title ? ` ${BOLD}${r.title}${RESET}` : "";

    lines.push(`${rank} ${score} ${path}${title}`);

    if (r.snippet) {
      const snippet = r.snippet.trim().replace(/\n/g, "\n      ");
      lines.push(`      ${DIM}${snippet}${RESET}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

export function formatStatus(info: {
  collection: string;
  documents: number;
  embeddings: number;
  path: string;
}): string {
  return [
    `${BOLD}Collection:${RESET} ${info.collection}`,
    `${BOLD}Documents:${RESET}  ${GREEN}${info.documents}${RESET}`,
    `${BOLD}Embeddings:${RESET} ${GREEN}${info.embeddings}${RESET}`,
    `${BOLD}Path:${RESET}       ${DIM}${info.path}${RESET}`,
  ].join("\n");
}

export function formatSuccess(message: string): string {
  return `${GREEN}✓${RESET} ${message}`;
}

export function formatError(message: string): string {
  return `\x1b[31m✗${RESET} ${message}`;
}

export function formatWarning(message: string): string {
  return `${YELLOW}⚠${RESET} ${message}`;
}
