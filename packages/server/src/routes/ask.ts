import type { Hono } from "hono";
import type { Config } from "@ra/core";
import { askStream } from "@ra/core";

export function askRoute(app: Hono, config: Config) {
  app.post("/ask", async (c) => {
    const { prompt, model, maxTurns, systemPrompt } = await c.req.json<{
      prompt: string;
      model?: string;
      maxTurns?: number;
      systemPrompt?: string;
    }>();

    if (!prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of askStream(prompt, config, {
              model,
              maxTurns,
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
