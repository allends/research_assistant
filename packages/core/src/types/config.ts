export interface VaultConfig {
  path: string;
  qmd_collection: string;
  obsidian_cli: boolean;
}

export interface DefaultsConfig {
  model: string;
  search_mode: "keyword" | "semantic" | "hybrid";
  search_results: number;
}

export interface AgentConfig {
  max_turns: number;
  permission_mode: string;
}

export interface Config {
  vault: VaultConfig;
  defaults: DefaultsConfig;
  agent: AgentConfig;
}

export const DEFAULT_CONFIG: Config = {
  vault: {
    path: "",
    qmd_collection: "",
    obsidian_cli: false,
  },
  defaults: {
    model: "claude-sonnet-4-5",
    search_mode: "hybrid",
    search_results: 10,
  },
  agent: {
    max_turns: 25,
    permission_mode: "bypassPermissions",
  },
};
