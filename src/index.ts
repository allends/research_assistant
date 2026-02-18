#!/usr/bin/env bun

import { Command } from "commander";
import { initCommand } from "./commands/init.ts";
import { searchCommand } from "./commands/search.ts";
import { indexCommand } from "./commands/index-cmd.ts";
import { setVerbose } from "./utils/logger.ts";
import { getVaultPath } from "./config.ts";

const program = new Command();

program
  .name("ra")
  .description("Research assistant for Obsidian vaults")
  .version("0.1.0")
  .option("-v, --verbose", "Enable verbose logging")
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().verbose) {
      setVerbose(true);
    }
  });

program
  .command("init")
  .description("Initialize research-assistant for an Obsidian vault")
  .argument("[vault-path]", "Path to Obsidian vault directory (defaults to RA_VAULT env)")
  .action(async (vaultPath?: string) => {
    const resolved = vaultPath ?? getVaultPath();
    if (!resolved) {
      console.error("No vault path provided. Pass a path or set RA_VAULT in .env");
      process.exit(1);
    }
    await initCommand(resolved);
  });

program
  .command("search")
  .description("Search your vault using hybrid search")
  .argument("<query>", "Search query")
  .option(
    "-m, --mode <mode>",
    "Search mode: keyword, semantic, or hybrid",
    "hybrid",
  )
  .option("-n, --limit <number>", "Number of results", "10")
  .option("--min-score <number>", "Minimum score threshold")
  .option("--json", "Output as JSON", false)
  .action(
    async (
      query: string,
      options: {
        mode: string;
        limit: string;
        minScore?: string;
        json: boolean;
      },
    ) => {
      await searchCommand(query, {
        mode: options.mode as "keyword" | "semantic" | "hybrid",
        limit: parseInt(options.limit, 10),
        minScore: options.minScore ? parseFloat(options.minScore) : undefined,
        json: options.json,
      });
    },
  );

program
  .command("index")
  .description("Re-index and embed vault documents")
  .option("--update", "Incremental update only", false)
  .option("--status", "Show index status", false)
  .action(async (options: { update: boolean; status: boolean }) => {
    await indexCommand(options);
  });

program.parse();
