import { getSession } from "@/lib/session";
import { projectFromRequest } from "@/lib/projects";
import type { StudioEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * SSE feed of studio events. The session outlives this connection, so a
 * reload just re-subscribes — /api/state carries the backlog.
 */
export async function GET(req: Request) {
  const root = projectFromRequest(req);
  // A reel that hasn't been started has no session to listen to. The client
  // reconnects with a project the moment one exists.
  if (!root) return new Response("No project", { status: 404 });

  const session = getSession(root);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (event: StudioEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      const unsubscribe = session.subscribe(send);

      // Comment frames keep proxies and the browser from closing an idle
      // stream while a long render produces nothing to say.
      const heartbeat = setInterval(() => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          open = false;
        }
      }, 15000);

      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
