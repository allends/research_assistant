import type { Hono } from "hono";
import type { Config, SearchMode } from "@ra/core";
import { qmd } from "@ra/core";

export function searchRoute(app: Hono, config: Config) {
  app.post("/search", async (c) => {
    const { query, mode, limit, minScore } = await c.req.json<{
      query: string;
      mode?: SearchMode;
      limit?: number;
      minScore?: number;
    }>();

    if (!query) {
      return c.json({ error: "query is required" }, 400);
    }

    const results = await qmd.hybridSearch(
      query,
      mode ?? config.defaults.search_mode,
      { limit: limit ?? config.defaults.search_results, minScore },
    );

    return c.json({ results, query, mode: mode ?? config.defaults.search_mode });
  });
}
