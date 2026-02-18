import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Config } from "@ra/core";
import { healthRoute } from "./routes/health.ts";
import { searchRoute } from "./routes/search.ts";
import { askRoute } from "./routes/ask.ts";
import { chatRoute } from "./routes/chat.ts";
import { notesRoute } from "./routes/notes.ts";
import { indexRoute } from "./routes/index-cmd.ts";
import { linkSuggestRoute } from "./routes/link-suggest.ts";
import { reviewRoute } from "./routes/review.ts";
import { authMiddleware } from "./middleware/auth.ts";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

export async function startServer(config: Config, options: { port?: number } = {}) {
  const app = new Hono();
  const port = options.port ?? 3117;
  const token = crypto.randomUUID();

  // Write server info for clients to discover
  const configDir = join(homedir(), ".research-assistant");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  await Bun.write(
    join(configDir, "server.json"),
    JSON.stringify({ port, token, pid: process.pid }, null, 2),
  );

  app.use("*", cors({ origin: ["app://obsidian.md", "http://localhost:*"] }));
  app.use("*", authMiddleware(token));

  healthRoute(app, config);
  searchRoute(app, config);
  askRoute(app, config);
  chatRoute(app, config);
  notesRoute(app, config);
  indexRoute(app, config);
  linkSuggestRoute(app, config);
  reviewRoute(app, config);

  console.log(`Research Assistant server running on http://localhost:${port}`);
  console.log(`Auth token: ${token}`);

  Bun.serve({ fetch: app.fetch, port });
}
