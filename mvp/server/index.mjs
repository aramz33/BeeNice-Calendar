import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createCalendarProvider } from "./lib/provider.mjs";
import { createStore } from "./lib/state.mjs";
import { createApp } from "./app.mjs";

const provider = createCalendarProvider();
const store = createStore(provider);
const PORT = Number(process.env.MVP_API_PORT ?? 8787);
const HOST = process.env.MVP_API_HOST ?? "127.0.0.1";
const DIST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

const app = createApp(store, provider, DIST_DIR);

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`[mvp-api] listening on http://${HOST}:${PORT} (${provider.mode})`);
});

setInterval(() => {
  void store.refreshCalendarBookings().catch(() => {});
}, 60_000);
