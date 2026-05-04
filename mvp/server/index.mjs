import http from "node:http";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createCalendarProvider } from "./lib/provider.mjs";
import { createStore } from "./lib/state.mjs";
import { serveAppAsset } from "./lib/http/asset-routes.mjs";
import { handleAdminRoutes } from "./lib/http/admin-routes.mjs";
import { handleBookRoutes } from "./lib/http/book-routes.mjs";
import { handleConnectionRoutes } from "./lib/http/connection-routes.mjs";
import { json } from "./lib/http/helpers.mjs";
import { handleBookingStream, handleAdminStream } from "./lib/http/streams.mjs";
import { handleWebhookRoutes } from "./lib/http/webhook-routes.mjs";

const provider = createCalendarProvider();
const store = createStore(provider);
const PORT = Number(process.env.MVP_API_PORT ?? 8787);
const HOST = process.env.MVP_API_HOST ?? "127.0.0.1";
const DIST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/book/") && pathname.endsWith("/stream")) {
      return handleBookingStream(pathname, request, response, store);
    }
    if (pathname === "/api/admin/stream") {
      return handleAdminStream(request, response, store);
    }

    for (const handler of [
      handleBookRoutes,
      handleConnectionRoutes,
      handleAdminRoutes,
      handleWebhookRoutes,
    ]) {
      const handled = await handler({
        pathname,
        request,
        response,
        store,
        provider,
        url,
      });
      if (handled) {
        return;
      }
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const served = await serveAppAsset(pathname, response, request.method, DIST_DIR);
      if (served) {
        return;
      }
    }

    return json(response, 404, { error: "Route introuvable." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Une erreur serveur est survenue.";
    const status = message.includes("plus disponible") ? 409 : 400;
    return json(response, status, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[mvp-api] listening on http://${HOST}:${PORT} (${provider.mode})`);
});

setInterval(() => {
  void store.refreshCalendarBookings().catch(() => {
    // Best effort refresh only.
  });
}, 60_000);
