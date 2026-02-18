import { askStream, AuthError } from "@ra/core";
import { loadConfig, configExists } from "../config.ts";

export async function askCommand(
  question: string,
  options: { model?: string; maxTurns?: string },
): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();
  let exitCode = 0;

  try {
    for await (const event of askStream(question, config, {
      model: options.model,
      maxTurns: options.maxTurns ? parseInt(options.maxTurns, 10) : undefined,
    })) {
      if (event.type === "text") process.stdout.write(event.text!);
      if (event.type === "error") {
        console.error(`\nAgent stopped: ${event.error}`);
        exitCode = 1;
      }
    }
  } catch (e) {
    if (e instanceof AuthError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  process.stdout.write("\n");

  // The MCP server keeps internal handles open, preventing the process from
  // exiting naturally. Force exit for single-shot commands.
  process.exit(exitCode);
}
