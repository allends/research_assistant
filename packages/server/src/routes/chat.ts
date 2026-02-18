import type { Hono } from "hono";
import type { Config } from "@ra/core";
import { chatStream } from "@ra/core";
import { getSession, setSession } from "../sessions.ts";

export function chatRoute(app: Hono, config: Config) {
  app.post("/chat", async (c) => {
    const { prompt, sessionId: clientSessionId, model, maxTurns } = await c.req.json<{
      prompt: string;
      sessionId?: string;
      model?: string;
      maxTurns?: number;
    }>();

    if (!prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    const agentSessionId = clientSessionId
      ? getSession(clientSessionId)
      : undefined;

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of chatStream(prompt, config, agentSessionId, {
              model,
              maxTurns,
            })) {
              // When we get a done event, store the session mapping
              if (event.type === "done" && event.sessionId && clientSessionId) {
                setSession(clientSessionId, event.sessionId);
              }
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
