/** Shared request/response types for server↔client communication. */

export interface AgentEvent {
  type: "text" | "tool_start" | "tool_end" | "error" | "done";
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  sessionId?: string;
  error?: string;
}

export interface SearchRequest {
  query: string;
  mode?: "keyword" | "semantic" | "hybrid";
  limit?: number;
  minScore?: number;
}

export interface AskRequest {
  prompt: string;
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
}

export interface ChatRequest {
  prompt: string;
  sessionId?: string;
  model?: string;
  maxTurns?: number;
}

export interface LinkSuggestRequest {
  file: string;
  apply?: boolean;
  model?: string;
}

export interface ReviewRequest {
  days?: number;
  model?: string;
}

export interface IndexRequest {
  update?: boolean;
  status?: boolean;
}

export interface HealthResponse {
  status: "ok";
  vault: string;
  pid: number;
}

export interface ErrorResponse {
  error: string;
}
