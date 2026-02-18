// Agent engine
export { askStream, chatStream, AuthError } from "./agent/engine.ts";
export { createVaultMcpServer } from "./agent/tools.ts";
export {
  askSystemPrompt,
  chatSystemPrompt,
  linkSuggestSystemPrompt,
  reviewSystemPrompt,
} from "./agent/system-prompts.ts";

// Integrations
export * as qmd from "./integrations/qmd.ts";
export * as vaultFs from "./integrations/vault-fs.ts";
export * as obsidianCli from "./integrations/obsidian-cli.ts";

// Types
export type { Config, VaultConfig, DefaultsConfig, AgentConfig } from "./types/config.ts";
export { DEFAULT_CONFIG } from "./types/config.ts";
export type {
  QmdSearchResult,
  QmdSearchResponse,
  QmdStatusResponse,
  SearchMode,
} from "./types/search.ts";
export type { Note, NoteFrontmatter, VaultStats } from "./types/vault.ts";
export type {
  AgentEvent,
  SearchRequest,
  AskRequest,
  ChatRequest,
  LinkSuggestRequest,
  ReviewRequest,
  IndexRequest,
  HealthResponse,
  ErrorResponse,
} from "./types/api.ts";

// Utils
export { setVerbose, debug, info, error, warn } from "./utils/logger.ts";
export {
  formatSearchResults,
  formatStatus,
  formatSuccess,
  formatError,
  formatWarning,
} from "./utils/formatter.ts";
export {
  parseFrontmatter,
  extractWikilinks,
  extractTags,
  extractHeadings,
} from "./utils/markdown.ts";
