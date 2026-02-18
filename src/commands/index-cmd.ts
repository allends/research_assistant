import { loadConfig, configExists } from "../config.ts";
import * as qmd from "../integrations/qmd.ts";
import { formatStatus, formatSuccess, formatError } from "../utils/formatter.ts";
import { info, error } from "../utils/logger.ts";

interface IndexOptions {
  update: boolean;
  status: boolean;
}

export async function indexCommand(options: IndexOptions): Promise<void> {
  if (!configExists()) {
    info("No configuration found. Run 'ra init <vault-path>' first.");
    process.exit(1);
  }

  await loadConfig();

  if (options.status) {
    try {
      const statusInfo = await qmd.status();
      info(formatStatus(statusInfo));
    } catch (e) {
      error("Failed to get status:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
    return;
  }

  try {
    if (options.update) {
      info("Updating index (incremental)...");
      await qmd.update();
      info(formatSuccess("Index updated"));
    } else {
      info("Re-indexing and re-embedding...");
      await qmd.update();
      info(formatSuccess("Index updated"));
      await qmd.embed();
      info(formatSuccess("Embeddings generated"));
    }

    const statusInfo = await qmd.status();
    info(`\n${formatStatus(statusInfo)}`);
  } catch (e) {
    info(formatError(`Indexing failed: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }
}
