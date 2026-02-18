import type { Hono } from "hono";
import type { Config } from "@ra/core";

export function healthRoute(app: Hono, config: Config) {
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      vault: config.vault.path,
      pid: process.pid,
    });
  });
}
