import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { Config } from "./types/config.ts";
import { DEFAULT_CONFIG } from "./types/config.ts";

const CONFIG_DIR = join(homedir(), ".research-assistant");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export async function loadConfig(): Promise<Config> {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = await Bun.file(CONFIG_PATH).text();
  const parsed = JSON.parse(raw) as Partial<Config>;

  return {
    vault: { ...DEFAULT_CONFIG.vault, ...parsed.vault },
    defaults: { ...DEFAULT_CONFIG.defaults, ...parsed.defaults },
    agent: { ...DEFAULT_CONFIG.agent, ...parsed.agent },
  };
}

export async function saveConfig(config: Config): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function validateVaultPath(path: string): boolean {
  return existsSync(join(path, ".obsidian"));
}
