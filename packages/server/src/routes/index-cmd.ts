import type { Hono } from "hono";
import type { Config } from "@ra/core";
import { qmd } from "@ra/core";

export function indexRoute(app: Hono, config: Config) {
  app.get("/index/status", async (c) => {
    const status = await qmd.status();
    return c.json(status);
  });

  app.post("/index", async (c) => {
    const { update } = await c.req.json<{ update?: boolean }>();

    await qmd.update();
    if (!update) {
      await qmd.embed();
    }

    const status = await qmd.status();
    return c.json({ status: "ok", ...status });
  });
}
