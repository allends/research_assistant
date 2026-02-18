import type { Config } from "../types/config.ts";
import * as vaultFs from "../integrations/vault-fs.ts";

export async function askSystemPrompt(config: Config): Promise<string> {
  const stats = await vaultFs.getVaultStats(config.vault.path);
  const notes = await vaultFs.listNotes(config.vault.path);
  const folders = [
    ...new Set(
      notes
        .map((n) => n.split("/").slice(0, -1).join("/"))
        .filter((f) => f.length > 0),
    ),
  ].sort();

  return `You are a research assistant for an Obsidian vault.

## Vault Context
- Path: ${config.vault.path}
- Collection: ${config.vault.qmd_collection}
- Total notes: ${stats.totalNotes}
- Folders: ${folders.length > 0 ? folders.join(", ") : "(flat structure)"}

## Instructions
- Use qmd_search to find relevant notes (prefer hybrid mode for best results)
- Use qmd_get to read full document content when you need details
- Use vault_list and vault_read for browsing and reading specific notes
- Cite sources using [[wikilinks]] notation (e.g. [[note-name]])
- Be concise and direct in your answers
- If you can't find relevant information, say so honestly
- Do NOT modify vault files unless explicitly asked to`;
}

export async function chatSystemPrompt(config: Config): Promise<string> {
  const base = await askSystemPrompt(config);

  return `${base}

## Chat Session
- This is an interactive multi-turn conversation
- You may reference information from earlier in the conversation
- When the user asks you to create or edit notes, use vault_write
- Ask clarifying questions when the user's intent is ambiguous
- You can use obsidian_eval for live Obsidian queries if available`;
}
