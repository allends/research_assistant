import { query } from "@anthropic-ai/claude-agent-sdk";
import { createVaultMcpServer } from "./tools.ts";
import { askSystemPrompt, chatSystemPrompt } from "./system-prompts.ts";
import type { Config } from "../types/config.ts";
import type { AgentEvent } from "../types/api.ts";

const VAULT_TOOLS = [
  "mcp__vault__qmd_search",
  "mcp__vault__qmd_get",
  "mcp__vault__vault_list",
  "mcp__vault__vault_read",
  "mcp__vault__vault_write",
  "mcp__vault__obsidian_eval",
];

export class AuthError extends Error {
  constructor() {
    super(
      "No authentication found. Either:\n" +
        "  - Set ANTHROPIC_API_KEY for API billing, or\n" +
        "  - Run 'claude setup-token' and set CLAUDE_CODE_OAUTH_TOKEN for Max subscription billing",
    );
    this.name = "AuthError";
  }
}

function checkAuth(): void {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new AuthError();
  }
}

export async function* askStream(
  prompt: string,
  config: Config,
  options: { model?: string; maxTurns?: number; systemPrompt?: string } = {},
): AsyncGenerator<AgentEvent> {
  checkAuth();

  const vaultMcpServer = createVaultMcpServer(config.vault.path);
  const systemPrompt = options.systemPrompt ?? (await askSystemPrompt(config));
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
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text") {
          yield { type: "text", text: block.text };
        }
        if (block.type === "tool_use") {
          yield { type: "tool_start", toolName: block.name, toolInput: block.input as Record<string, unknown> };
        }
      }
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        yield { type: "done", sessionId: message.session_id };
      } else {
        yield {
          type: "error",
          error: `${message.subtype}${message.errors?.length ? " — " + message.errors.join(", ") : ""}`,
        };
      }
    }
  }
}

export async function* chatStream(
  prompt: string,
  config: Config,
  sessionId?: string,
  options: { model?: string; maxTurns?: number; systemPrompt?: string } = {},
): AsyncGenerator<AgentEvent> {
  checkAuth();

  const vaultMcpServer = createVaultMcpServer(config.vault.path);
  const systemPrompt = options.systemPrompt ?? (await chatSystemPrompt(config));
  const model = options.model ?? config.defaults.model;

  const queryOptions: Record<string, any> = {
    model,
    systemPrompt,
    mcpServers: { vault: vaultMcpServer },
    allowedTools: VAULT_TOOLS,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    maxTurns: options.maxTurns ?? config.agent.max_turns,
    cwd: config.vault.path,
  };

  if (sessionId) {
    queryOptions.resume = sessionId;
  }

  const conversation = query({ prompt, options: queryOptions });

  for await (const message of conversation) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text") {
          yield { type: "text", text: block.text };
        }
        if (block.type === "tool_use") {
          yield { type: "tool_start", toolName: block.name, toolInput: block.input as Record<string, unknown> };
        }
      }
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        yield { type: "done", sessionId: message.session_id };
      } else {
        yield {
          type: "error",
          error: `${message.subtype}${message.errors?.length ? " — " + message.errors.join(", ") : ""}`,
        };
      }
    }
  }
}
