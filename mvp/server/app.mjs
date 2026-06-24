import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { createBookRouter } from "./lib/http/book-routes.mjs";
import { createAdminRouter } from "./lib/http/admin-routes.mjs";
import { createConnectionRouter } from "./lib/http/connection-routes.mjs";
import { createWebhookRouter } from "./lib/http/webhook-routes.mjs";
import { createCallerRouter } from "./lib/http/caller-routes.mjs";
import { registerStreamRoutes } from "./lib/http/streams.mjs";
import { serveAppAsset } from "./lib/http/asset-routes.mjs";
import { getTrustedOrigins, requireAuth, requireAdmin } from "./lib/auth.mjs";

export function createApp(store, provider, auth = null, distDir = null) {
  const app = new Hono();

  const trustedOrigins = getTrustedOrigins();

  app.use("/api/auth/*", cors({
    origin: trustedOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    maxAge: 600,
    credentials: true,
  }));
  app.use("/api/*", cors());

  if (auth) {
    app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
    app.use("/api/admin/*", async (c, next) => {
      if (c.req.path === "/api/admin/integrations/nylas/callback") return next();
      return requireAdmin(auth)(c, next);
    });
    app.use("/api/book/*", requireAuth(auth));
    app.use("/api/caller/*", requireAuth(auth));
  }

  registerStreamRoutes(app, store);

  app.route("/api/book", createBookRouter(store));
  app.route("/api/caller", createCallerRouter(store));
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
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : "Erreur serveur.";
    const status = message.includes("plus disponible") ? 409 : err instanceof Error ? 400 : 500;
    return c.json({ error: message }, status);
  });

  return app;
}
