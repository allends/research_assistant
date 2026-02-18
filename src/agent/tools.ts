import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import * as qmd from "../integrations/qmd.ts";
import * as vaultFs from "../integrations/vault-fs.ts";
import * as obsidianCli from "../integrations/obsidian-cli.ts";
import { basename } from "path";

export function createVaultMcpServer(vaultPath: string) {
  const qmdSearchTool = tool(
    "qmd_search",
    "Search vault notes using hybrid BM25 + semantic search. Returns scored results with snippets.",
    {
      query: z.string().describe("Search query"),
      mode: z
        .enum(["keyword", "semantic", "hybrid"])
        .default("hybrid")
        .describe("Search mode"),
      limit: z.number().default(10).describe("Max results to return"),
    },
    async (args) => {
      const results = await qmd.hybridSearch(args.query, args.mode, {
        limit: args.limit,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  const qmdGetTool = tool(
    "qmd_get",
    "Retrieve full document content by file path or document ID.",
    {
      ref: z.string().describe("File path or document ID"),
    },
    async (args) => {
      const text = await qmd.get(args.ref);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  const vaultListTool = tool(
    "vault_list",
    "List all markdown notes in the vault, optionally filtered by subfolder.",
    {
      folder: z.string().optional().describe("Subfolder to filter by"),
    },
    async (args) => {
      const notes = await vaultFs.listNotes(vaultPath);
      const filtered = args.folder
        ? notes.filter((n) => n.startsWith(args.folder!))
        : notes;
      const items = filtered.map((n) => ({
        path: n,
        basename: basename(n, ".md"),
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
      };
    },
  );

  const vaultReadTool = tool(
    "vault_read",
    "Read a note's raw content including parsed frontmatter.",
    {
      path: z.string().describe("Relative path to note within vault"),
    },
    async (args) => {
      const note = await vaultFs.readNote(args.path, vaultPath);
      const output = {
        path: note.path,
        frontmatter: note.frontmatter,
        body: note.body,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
      };
    },
  );

  const vaultWriteTool = tool(
    "vault_write",
    "Create or update a note in the vault.",
    {
      path: z.string().describe("Relative path for the note"),
      content: z.string().describe("Full note content (including frontmatter if needed)"),
    },
    async (args) => {
      await vaultFs.writeNote(args.path, args.content, vaultPath);
      return {
        content: [{ type: "text" as const, text: `Wrote ${args.path}` }],
      };
    },
  );

  const obsidianEvalTool = tool(
    "obsidian_eval",
    "Execute JavaScript in Obsidian's context (requires Obsidian CLI). Returns result or error if unavailable.",
    {
      code: z.string().describe("JavaScript code to evaluate in Obsidian"),
    },
    async (args) => {
      try {
        const available = await obsidianCli.isAvailable();
        if (!available) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Obsidian CLI is not available. Use vault_read/vault_list for file operations instead.",
              },
            ],
          };
        }
        const result = await obsidianCli.evalCode(args.code);
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Obsidian eval error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );

  return createSdkMcpServer({
    name: "vault",
    version: "0.1.0",
    tools: [
      qmdSearchTool,
      qmdGetTool,
      vaultListTool,
      vaultReadTool,
      vaultWriteTool,
      obsidianEvalTool,
    ],
  });
}
