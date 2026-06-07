import { streamSSE } from "hono/streaming";

export function registerStreamRoutes(app, store) {
  app.get("/api/book/:slug/stream", (c) => {
    const slug = c.req.param("slug");
    return streamSSE(c, async (stream) => {
      const client = { writeSSE: (opts) => stream.writeSSE(opts) };

      await stream.writeSSE({
        event: "availability.updated",
        data: JSON.stringify({ slug, at: new Date().toISOString() }),
      });

      const heartbeat = setInterval(
        () => stream.writeSSE({ event: "ping", data: String(Date.now()) }),
        15000,
      );

      store.addSseClient(slug, client);
      await new Promise((resolve) => {
        stream.onAbort(() => {
          clearInterval(heartbeat);
          store.removeSseClient(slug, client);
          resolve();
        });
      });
    });
  });

  app.get("/api/admin/stream", (c) => {
    return streamSSE(c, async (stream) => {
      const client = { writeSSE: (opts) => stream.writeSSE(opts) };

      await stream.writeSSE({
        event: "booking.updated",
        data: JSON.stringify({ at: new Date().toISOString() }),
      });

      const heartbeat = setInterval(
        () => stream.writeSSE({ event: "ping", data: String(Date.now()) }),
        15000,
      );

      store.addAdminSseClient(client);
      await new Promise((resolve) => {
        stream.onAbort(() => {
          clearInterval(heartbeat);
          store.removeAdminSseClient(client);
          resolve();
        });
      });
    });
  });
}
