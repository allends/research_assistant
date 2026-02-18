import { qmd, formatSearchResults, info, error } from "@ra/core";
import type { SearchMode } from "@ra/core";
import { loadConfig, configExists } from "../config.ts";

interface SearchOptions {
  mode: SearchMode;
  limit: number;
  json: boolean;
  minScore?: number;
}

export async function searchCommand(
  queryStr: string,
  options: SearchOptions,
): Promise<void> {
  if (!configExists()) {
    info("No configuration found. Run 'ra init <vault-path>' first.");
    process.exit(1);
  }

  const config = await loadConfig();
  const mode = options.mode ?? config.defaults.search_mode;
  const limit = options.limit ?? config.defaults.search_results;

  try {
    const results = await qmd.hybridSearch(queryStr, mode, {
      limit,
      minScore: options.minScore,
    });

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      info(formatSearchResults(results));
    }
  } catch (e) {
    error("Search failed:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
