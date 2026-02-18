import type { Hono } from "hono";
import type { Config } from "@ra/core";
import { vaultFs } from "@ra/core";

export function notesRoute(app: Hono, config: Config) {
  app.get("/notes", async (c) => {
    const notes = await vaultFs.listNotes(config.vault.path);
    return c.json({ notes });
  });

  app.get("/notes/:path{.+}", async (c) => {
    const notePath = c.req.param("path");
    try {
      const note = await vaultFs.readNote(notePath, config.vault.path);
      return c.json({
        path: note.path,
        frontmatter: note.frontmatter,
        body: note.body,
      });
    } catch {
      return c.json({ error: `Note not found: ${notePath}` }, 404);
    }
  });
}
