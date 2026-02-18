import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import type { Config } from "./types/config.ts";
import { DEFAULT_CONFIG } from "./types/config.ts";

const CONFIG_DIR = join(homedir(), ".research-assistant");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function isDevMode(): boolean {
  const val = process.env.RA_DEV;
  return val === "1" || val === "true";
}

export function getProjectRoot(): string {
  return resolve(import.meta.dir, "..");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function configExists(): boolean {
  if (isDevMode() || process.env.RA_VAULT) return true;
  return existsSync(CONFIG_PATH);
}

export function getVaultPath(): string | undefined {
  const envVault = process.env.RA_VAULT;
  if (envVault) return resolve(envVault);
  if (isDevMode()) return join(getProjectRoot(), "test-vault");
  return undefined;
}

export async function loadConfig(): Promise<Config> {
  const vaultPath = getVaultPath();
  const devConfig: Config =
    isDevMode() || vaultPath
      ? {
          vault: {
            path: vaultPath ?? join(getProjectRoot(), "test-vault"),
            qmd_collection:
              vaultPath?.split("/").pop()?.toLowerCase().replace(/[^a-z0-9-]/g, "-") ??
              "test-vault",
            obsidian_cli: false,
          },
          defaults: { ...DEFAULT_CONFIG.defaults },
          agent: { ...DEFAULT_CONFIG.agent },
        }
      : { ...DEFAULT_CONFIG };

  if (!existsSync(CONFIG_PATH)) {
    return devConfig;
  }

  const raw = await Bun.file(CONFIG_PATH).text();
  const parsed = JSON.parse(raw) as Partial<Config>;

  return {
    vault: { ...devConfig.vault, ...parsed.vault },
    defaults: { ...devConfig.defaults, ...parsed.defaults },
    agent: { ...devConfig.agent, ...parsed.agent },
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
