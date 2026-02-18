import { resolve } from "path";
import { loadConfig, saveConfig, validateVaultPath } from "../config.ts";
import * as qmd from "../integrations/qmd.ts";
import * as obsidian from "../integrations/obsidian-cli.ts";
import { formatSuccess, formatWarning, formatError } from "../utils/formatter.ts";
import { info, error as logError } from "../utils/logger.ts";

export async function initCommand(vaultPath: string): Promise<void> {
  const resolved = resolve(vaultPath);

  if (!validateVaultPath(resolved)) {
    info(formatError(`Not an Obsidian vault: ${resolved}`));
    info("Expected to find a .obsidian/ directory.");
    process.exit(1);
  }

  const vaultName = resolved.split("/").pop() ?? "vault";
  const collectionName = vaultName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  info(`Initializing research-assistant for vault: ${resolved}`);

  // Check QMD availability
  const qmdAvailable = await qmd.isAvailable();
  if (!qmdAvailable) {
    info(formatError("QMD is not installed or not in PATH."));
    info("Install it with: bun install -g @tobilu/qmd");
    process.exit(1);
  }
  info(formatSuccess("QMD found"));

  // Check Obsidian CLI availability
  const obsidianAvailable = await obsidian.isAvailable();
  if (obsidianAvailable) {
    const version = await obsidian.getVersion();
    info(formatSuccess(`Obsidian CLI found${version ? ` (${version})` : ""}`));
  } else {
    info(
      formatWarning(
        "Obsidian CLI not found. Will use filesystem fallback for vault access.",
      ),
    );
  }

  // Register QMD collection
  info("\nRegistering vault as QMD collection...");
  try {
    await qmd.collectionAdd(resolved, collectionName);
    info(formatSuccess(`Collection '${collectionName}' registered`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists")) {
      info(formatWarning(`Collection '${collectionName}' already exists`));
    } else {
      logError("Failed to register collection:", msg);
      process.exit(1);
    }
  }

  // Add context
  try {
    await qmd.contextAdd(
      `qmd://${collectionName}`,
      "Personal Obsidian knowledge base",
    );
    info(formatSuccess("Context added"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    info(formatWarning(`Context: ${msg}`));
  }

  // Run initial embedding
  info("\nRunning initial indexing and embedding (this may take a while)...");
  try {
    await qmd.update();
    info(formatSuccess("Indexing complete"));
    await qmd.embed();
    info(formatSuccess("Embedding complete"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError("Indexing/embedding failed:", msg);
    info("You can retry later with: ra index");
  }

  // Save config
  const config = await loadConfig();
  config.vault = {
    path: resolved,
    qmd_collection: collectionName,
    obsidian_cli: obsidianAvailable,
  };
  await saveConfig(config);
  info(formatSuccess("\nConfiguration saved"));

  info(`\nVault initialized! Try:\n  ra search "your query"\n  ra index --status`);
}
