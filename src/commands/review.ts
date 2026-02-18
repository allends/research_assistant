import { loadConfig, configExists } from "../config.ts";
import { askOnce } from "../agent/engine.ts";
import { reviewSystemPrompt } from "../agent/system-prompts.ts";
import * as vaultFs from "../integrations/vault-fs.ts";

export async function reviewCommand(options: {
  recent?: string;
  model?: string;
}): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();
  const days = options.recent ? parseInt(options.recent, 10) : 7;

  if (isNaN(days) || days <= 0) {
    console.error("--recent must be a positive number of days");
    process.exit(1);
  }

  const recentFiles = await vaultFs.getRecentNotes(config.vault.path, days);

  if (recentFiles.length === 0) {
    console.log(`No notes modified in the last ${days} day${days === 1 ? "" : "s"}.`);
    return;
  }

  console.log(
    `Found ${recentFiles.length} note${recentFiles.length === 1 ? "" : "s"} modified in the last ${days} day${days === 1 ? "" : "s"}.\n`,
  );

  const systemPrompt = await reviewSystemPrompt(config, recentFiles);

  await askOnce(
    `Review the ${recentFiles.length} recently modified notes and provide actionable insights.`,
    config,
    {
      model: options.model,
      maxTurns: 20,
      systemPrompt,
    },
  );
}
