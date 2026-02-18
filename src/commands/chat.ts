import { loadConfig, configExists } from "../config.ts";
import { chatLoop } from "../agent/engine.ts";

export async function chatCommand(options: {
  model?: string;
  context?: string;
}): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();
  await chatLoop(config, {
    model: options.model,
    context: options.context,
  });
}
