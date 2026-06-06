import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createCalendarProvider } from "./lib/provider.mjs";
import { createStore } from "./lib/state.mjs";
import { createApp } from "./app.mjs";
import { createAuth } from "./lib/auth.mjs";
import { getDefaultDatabasePath } from "./lib/database.mjs";
import { seedAuthUsers } from "./lib/seed-users.mjs";

const provider = createCalendarProvider();
const store = createStore(provider);
const PORT = Number(process.env.MVP_API_PORT ?? 8787);
const HOST = process.env.MVP_API_HOST ?? "127.0.0.1";
const DIST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

const dbPath = path.resolve(process.env.MVP_DB_PATH ?? getDefaultDatabasePath());
const auth = createAuth(dbPath);
await seedAuthUsers(auth, dbPath);

const app = createApp(store, provider, auth, DIST_DIR);

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`[mvp-api] listening on http://${HOST}:${PORT} (${provider.mode})`);
});

setInterval(() => {
  void store.refreshCalendarBookings().catch(() => {});
}, 60_000);
