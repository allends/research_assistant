import { query } from "@anthropic-ai/claude-agent-sdk";
import { createVaultMcpServer } from "./tools.ts";
import { askSystemPrompt, chatSystemPrompt } from "./system-prompts.ts";
import type { Config } from "../types/config.ts";
import { createInterface } from "readline";

const VAULT_TOOLS = [
  "mcp__vault__qmd_search",
  "mcp__vault__qmd_get",
  "mcp__vault__vault_list",
  "mcp__vault__vault_read",
  "mcp__vault__vault_write",
  "mcp__vault__obsidian_eval",
];

function checkAuth(): void {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.error(
      "No authentication found. Either:\n" +
        "  - Set ANTHROPIC_API_KEY for API billing, or\n" +
        "  - Run 'claude setup-token' and set CLAUDE_CODE_OAUTH_TOKEN for Max subscription billing",
    );
    process.exit(1);
  }
}

function writeAssistantContent(message: any): void {
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === "text") {
        process.stdout.write(block.text);
      }
    }
  }
}

export async function askOnce(
  prompt: string,
  config: Config,
  options: { model?: string; maxTurns?: number } = {},
): Promise<void> {
  checkAuth();

  const vaultMcpServer = createVaultMcpServer(config.vault.path);
  const systemPrompt = await askSystemPrompt(config);
  const model = options.model ?? config.defaults.model;
  const maxTurns = options.maxTurns ?? config.agent.max_turns;

  const conversation = query({
    prompt,
    options: {
      model,
      systemPrompt,
      mcpServers: { vault: vaultMcpServer },
      allowedTools: VAULT_TOOLS,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns,
      cwd: config.vault.path,
    },
  });

  for await (const message of conversation) {
    writeAssistantContent(message);

    if (message.type === "result") {
      if (message.subtype !== "success") {
        console.error(
          `\nAgent stopped: ${message.subtype}${message.errors?.length ? " — " + message.errors.join(", ") : ""}`,
        );
      }
    }
  }

  process.stdout.write("\n");
}

export async function chatLoop(
  config: Config,
  options: { model?: string; context?: string } = {},
): Promise<void> {
  checkAuth();

  const vaultMcpServer = createVaultMcpServer(config.vault.path);
  const systemPrompt = await chatSystemPrompt(config);
  const model = options.model ?? config.defaults.model;

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

    const queryOptions: Record<string, any> = {
      model,
      systemPrompt,
      mcpServers: { vault: vaultMcpServer },
      allowedTools: VAULT_TOOLS,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: config.agent.max_turns,
      cwd: config.vault.path,
    };

    if (sessionId) {
      queryOptions.resume = sessionId;
    }

    const conversation = query({ prompt, options: queryOptions });

    for await (const message of conversation) {
      writeAssistantContent(message);

      if (message.type === "result" && message.subtype === "success") {
        sessionId = message.session_id;
      } else if (message.type === "result" && message.subtype !== "success") {
        console.error(
          `\nAgent error: ${message.subtype}${message.errors?.length ? " — " + message.errors.join(", ") : ""}`,
        );
      }
    }

    process.stdout.write("\n\n");
    isFirstTurn = false;
  }

  rl.close();
  console.log("\nGoodbye!");
}
