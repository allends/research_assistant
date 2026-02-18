import type { Hono } from "hono";
import type { Config } from "@ra/core";
import { askStream, linkSuggestSystemPrompt, vaultFs, extractWikilinks } from "@ra/core";

export function linkSuggestRoute(app: Hono, config: Config) {
  app.post("/link-suggest", async (c) => {
    const { file, apply, model } = await c.req.json<{
      file: string;
      apply?: boolean;
      model?: string;
    }>();

    if (!file) {
      return c.json({ error: "file is required" }, 400);
    }

    const note = await vaultFs.readNote(file, config.vault.path);
    const existingLinks = extractWikilinks(note.content);
    const systemPrompt = await linkSuggestSystemPrompt(config, note.path, existingLinks);

    const prompt = apply
      ? `Analyze the note at "${note.path}" and suggest [[wikilinks]]. Then apply the suggestions by rewriting the note with vault_write, inserting wikilinks inline where they fit naturally in the text. Do NOT add a links section at the bottom — weave them into existing sentences.`
      : `Analyze the note at "${note.path}" and suggest [[wikilinks]] that should be added.`;

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of askStream(prompt, config, {
              model,
              maxTurns: 6,
              systemPrompt,
            })) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error })}\n\n`),
            );
          }
          controller.close();
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  });
}
