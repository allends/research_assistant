import { chatStream, AuthError } from "@ra/core";
import { loadConfig, configExists } from "../config.ts";
import { createInterface } from "readline";

export async function chatCommand(options: {
  model?: string;
  context?: string;
}): Promise<void> {
  if (!configExists()) {
    console.error("No configuration found. Run 'ra init' first.");
    process.exit(1);
  }

  const config = await loadConfig();

  try {
    // Validate auth upfront
    // chatStream will throw AuthError on first call, but check early for better UX
  } catch {}

  const vaultName = config.vault.path.split("/").pop() ?? "vault";
  console.log(`Research Assistant — ${vaultName}`);
  console.log(`Type your questions. /quit or Ctrl+C to exit.\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = (): Promise<string | null> =>
    new Promise((resolve) => {
      rl.question("> ", (answer) => resolve(answer));
      rl.once("close", () => resolve(null));
    });

  let sessionId: string | undefined;

  // If --context provided, prepend it to first prompt
  let contextPrefix = "";
  if (options.context) {
    try {
      const content = await Bun.file(options.context).text();
      contextPrefix = `Context from ${options.context}:\n\`\`\`\n${content}\n\`\`\`\n\n`;
    } catch {
      console.error(`Warning: Could not read context file: ${options.context}`);
    }
  }

  let isFirstTurn = true;

  while (true) {
    const input = await promptUser();
    if (input === null) break;

    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed === "/quit" || trimmed === "/exit") break;

    let prompt = trimmed;
    if (isFirstTurn && contextPrefix) {
      prompt = contextPrefix + prompt;
    }

    try {
      for await (const event of chatStream(prompt, config, sessionId, {
        model: options.model,
      })) {
        if (event.type === "text") process.stdout.write(event.text!);
        if (event.type === "done") sessionId = event.sessionId;
        if (event.type === "error") console.error(`\nAgent error: ${event.error}`);
      }
    } catch (e) {
      if (e instanceof AuthError) {
        console.error(e.message);
        rl.close();
        process.exit(1);
      }
      throw e;
    }

    process.stdout.write("\n\n");
    isFirstTurn = false;
  }

  rl.close();
  console.log("\nGoodbye!");
}
