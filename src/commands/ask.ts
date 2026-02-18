import { loadConfig, configExists } from "../config.ts";
import { askOnce } from "../agent/engine.ts";

export async function askCommand(
  question: string,
  options: { model?: string; maxTurns?: string },
): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();
  await askOnce(question, config, {
    model: options.model,
    maxTurns: options.maxTurns ? parseInt(options.maxTurns, 10) : undefined,
  });
}
