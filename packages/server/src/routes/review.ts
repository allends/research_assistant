import type { Hono } from "hono";
import type { Config } from "@ra/core";
import { askStream, reviewSystemPrompt, vaultFs } from "@ra/core";

export function reviewRoute(app: Hono, config: Config) {
  app.post("/review", async (c) => {
    const { days, model } = await c.req.json<{
      days?: number;
      model?: string;
    }>();

    const lookbackDays = days ?? 7;
    const recentFiles = await vaultFs.getRecentNotes(config.vault.path, lookbackDays);

    if (recentFiles.length === 0) {
      return c.json({ message: `No notes modified in the last ${lookbackDays} days.`, notes: 0 });
    }

    const systemPrompt = await reviewSystemPrompt(config, recentFiles);

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of askStream(
              `Review the ${recentFiles.length} recently modified notes and provide actionable insights.`,
              config,
              { model, maxTurns: 20, systemPrompt },
            )) {
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
