import { Hono } from "hono";
import { cors } from "hono/cors";
import { createBookRouter } from "./lib/http/book-routes.mjs";
import { createAdminRouter } from "./lib/http/admin-routes.mjs";
import { createConnectionRouter } from "./lib/http/connection-routes.mjs";
import { createWebhookRouter } from "./lib/http/webhook-routes.mjs";
import { registerStreamRoutes } from "./lib/http/streams.mjs";
import { serveAppAsset } from "./lib/http/asset-routes.mjs";
import { requireAuth, requireAdmin } from "./lib/auth.mjs";

export function createApp(store, provider, auth = null, distDir = null) {
  const app = new Hono();

  app.use("/api/*", cors());

  if (auth) {
    app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw));
    app.use("/api/admin/*", requireAdmin(auth));
    app.use("/api/book/*", requireAuth(auth));
    app.use("/api/caller/*", requireAuth(auth));
  }

  registerStreamRoutes(app, store);

  app.route("/api/book", createBookRouter(store));
  app.route("/api/admin", createAdminRouter(store, provider));
  app.route("/api/connect", createConnectionRouter(store));
  app.route("/api/webhooks", createWebhookRouter(store));

  if (distDir) {
    app.use("*", async (c) => {
      const res = await serveAppAsset(c, distDir);
      if (res) return res;
      return c.json({ error: "Route introuvable." }, 404);
    });
  }

  app.notFound((c) => c.json({ error: "Route introuvable." }, 404));

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : "Erreur serveur.";
    const status = message.includes("plus disponible") ? 409 : 400;
    return c.json({ error: message }, status);
  });

  return app;
}
