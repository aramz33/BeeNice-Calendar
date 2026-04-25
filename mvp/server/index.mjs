import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createCalendarProvider } from "./lib/provider.mjs";
import { createStore } from "./lib/state.mjs";

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
      return handleStream(pathname, request, response);
    }
    if (pathname === "/api/admin/stream") {
      return handleAdminStream(request, response);
    }

    if (request.method === "GET" && pathname === "/api/book") {
      return json(response, 200, { workspaces: store.listPublicBookingLinks() });
    }

    if (request.method === "GET" && match(pathname, /^\/api\/book\/([^/]+)$/)) {
      const slug = pathname.split("/").at(-1);
      return json(response, 200, store.getPublicBookingPayload(slug));
    }

    if (
      request.method === "GET" &&
      match(pathname, /^\/api\/book\/([^/]+)\/availability$/)
    ) {
      const slug = pathname.split("/")[3];
      return json(
        response,
        200,
        await store.listAvailability(slug, url.searchParams.get("companySize"), {
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        }),
      );
    }

    if (
      request.method === "GET" &&
      match(pathname, /^\/api\/book\/([^/]+)\/callers\/([^/]+)\/bookings$/)
    ) {
      const [, , , slug, , callerId] = pathname.split("/");
      return json(response, 200, store.listCallerBookings(slug, callerId));
    }

    if (
      request.method === "GET" &&
      match(pathname, /^\/api\/book\/([^/]+)\/callers\/([^/]+)\/tasks$/)
    ) {
      const [, , , slug, , callerId] = pathname.split("/");
      const bookingLink = store.getBookingLinkBySlug(slug);
      return json(
        response,
        200,
        store.listCallerTasks(callerId, bookingLink?.clientId ?? null),
      );
    }

    if (
      request.method === "POST" &&
      match(pathname, /^\/api\/book\/([^/]+)\/bookings$/)
    ) {
      const slug = pathname.split("/")[3];
      const body = await parseBody(request);
      return json(response, 201, await store.createBooking(slug, body));
    }

    if (
      request.method === "POST" &&
      match(pathname, /^\/api\/book\/([^/]+)\/callers\/([^/]+)\/bookings\/([^/]+)\/cancel$/)
    ) {
      const [, , , slug, , callerId, , bookingId] = pathname.split("/");
      return json(
        response,
        200,
        await store.cancelCallerBooking(slug, callerId, bookingId),
      );
    }

    if (
      request.method === "GET" &&
      match(pathname, /^\/api\/connect\/([^/]+)$/)
    ) {
      const inviteToken = pathname.split("/")[3];
      return json(response, 200, store.getPublicRepConnectionPayload(inviteToken));
    }

    if (
      request.method === "POST" &&
      match(pathname, /^\/api\/connect\/([^/]+)\/start$/)
    ) {
      const inviteToken = pathname.split("/")[3];
      const body = await parseBody(request);
      return json(response, 200, await store.startPublicRepConnection(inviteToken, body));
    }

    if (request.method === "GET" && pathname === "/api/admin/reps") {
      return json(response, 200, {
        reps: store.listReps(),
        integrations: provider.getOverview(),
      });
    }

    if (request.method === "GET" && pathname === "/api/admin/bookings") {
      return json(
        response,
        200,
        store.listAdminBookings({
          status: url.searchParams.get("status"),
          clientId: url.searchParams.get("clientId"),
          callerId: url.searchParams.get("callerId"),
          repId: url.searchParams.get("repId"),
          query: url.searchParams.get("query"),
        }),
      );
    }

    if (request.method === "GET" && pathname === "/api/admin/calendar") {
      return json(
        response,
        200,
        store.listAdminCalendar({
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          status: url.searchParams.get("status"),
          clientId: url.searchParams.get("clientId"),
          callerId: url.searchParams.get("callerId"),
          repId: url.searchParams.get("repId"),
          query: url.searchParams.get("query"),
        }),
      );
    }

    if (request.method === "GET" && pathname === "/api/admin/tasks") {
      return json(
        response,
        200,
        store.listAdminTasks({
          clientId: url.searchParams.get("clientId"),
          callerId: url.searchParams.get("callerId"),
          query: url.searchParams.get("query"),
        }),
      );
    }

    if (request.method === "GET" && pathname === "/api/admin/settings") {
      return json(response, 200, store.listSettings());
    }

    if (
      request.method === "GET" &&
      match(pathname, /^\/api\/admin\/bookings\/([^/]+)$/)
    ) {
      return json(response, 200, store.getBookingDetail(pathname.split("/").at(-1)));
    }

    if (
      request.method === "GET" &&
      match(pathname, /^\/api\/admin\/bookings\/([^/]+)\/availability$/)
    ) {
      const bookingId = pathname.split("/")[4];
      return json(
        response,
        200,
        await store.listBookingRescheduleAvailability(bookingId, {
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
        }),
      );
    }

    if (
      request.method === "PATCH" &&
      match(pathname, /^\/api\/admin\/bookings\/([^/]+)\/outcome$/)
    ) {
      const bookingId = pathname.split("/")[4];
      const body = await parseBody(request);
      await store.updateBookingOutcome(bookingId, body.outcomeState, body.reason);
      return json(response, 200, { ok: true });
    }

    if (
      request.method === "PATCH" &&
      match(pathname, /^\/api\/admin\/bookings\/([^/]+)\/schedule$/)
    ) {
      const bookingId = pathname.split("/")[4];
      const body = await parseBody(request);
      await store.updateBookingSchedule(
        bookingId,
        body.scheduleState,
        body.reason,
        body.nextStartAt,
      );
      return json(response, 200, { ok: true });
    }

    if (
      request.method === "PATCH" &&
      match(pathname, /^\/api\/admin\/tasks\/([^/]+)$/)
    ) {
      const taskId = pathname.split("/")[4];
      const body = await parseBody(request);
      await store.updateTask(taskId, body);
      return json(response, 200, { ok: true });
    }

    if (request.method === "POST" && pathname === "/api/admin/settings/clients") {
      const body = await parseBody(request);
      return json(response, 201, store.createClient(body));
    }

    if (
      request.method === "PATCH" &&
      match(pathname, /^\/api\/admin\/settings\/clients\/([^/]+)$/)
    ) {
      const clientId = pathname.split("/")[5];
      const body = await parseBody(request);
      return json(response, 200, store.updateClient(clientId, body));
    }

    if (request.method === "POST" && pathname === "/api/admin/settings/callers") {
      const body = await parseBody(request);
      return json(response, 201, store.createCaller(body));
    }

    if (
      request.method === "PATCH" &&
      match(pathname, /^\/api\/admin\/settings\/callers\/([^/]+)$/)
    ) {
      const callerId = pathname.split("/")[5];
      const body = await parseBody(request);
      return json(response, 200, store.updateCaller(callerId, body));
    }

    if (
      request.method === "POST" &&
      match(pathname, /^\/api\/admin\/reps\/([^/]+)\/connect-nylas\/start$/)
    ) {
      const repId = pathname.split("/")[4];
      const body = await parseBody(request);
      return json(response, 200, await store.startRepConnection(repId, body));
    }

    if (
      request.method === "POST" &&
      match(pathname, /^\/api\/admin\/reps\/([^/]+)\/connect-nylas$/)
    ) {
      const repId = pathname.split("/")[4];
      const body = await parseBody(request);
      return json(response, 200, await store.connectRep(repId, body));
    }

    if (
      request.method === "GET" &&
      pathname === "/api/admin/integrations/nylas/callback"
    ) {
      try {
        const result = await store.finalizeRepConnection(url.searchParams);
        return html(
          response,
          200,
          renderCallbackPage({
            title:
              result.callbackMode === "public_terminal"
                ? "Authentification réussie"
                : "Connexion calendrier active",
            description:
              result.callbackMode === "public_terminal"
                ? "L'authentification a réussi, merci."
                : "La connexion Nylas est terminée. Vous pouvez revenir à la console admin.",
            target:
              result.callbackMode === "public_terminal"
                ? null
                : `/admin/bookings?connected=${encodeURIComponent(result.repId)}`,
            ctaLabel: "Retourner à la console admin",
          }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Connexion Nylas impossible.";
        const state = decodeCallbackState(url.searchParams.get("state"));
        return html(
          response,
          400,
          renderCallbackPage({
            title:
              state?.source === "public_invite"
                ? "Authentification échouée"
                : "Connexion calendrier échouée",
            description: message,
            target:
              state?.source === "public_invite"
                ? null
                : `/admin/bookings?connectionError=${encodeURIComponent(message)}`,
            ctaLabel: "Retourner à la console admin",
          }),
        );
      }
    }

    if (request.method === "GET" && pathname === "/api/webhooks/nylas") {
      const challenge = url.searchParams.get("challenge");
      if (challenge) {
        response.writeHead(200, {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        });
        response.end(challenge);
        return;
      }
      return json(response, 200, { ok: true });
    }

    if (request.method === "POST" && pathname === "/api/webhooks/nylas") {
      const body = await parseBody(request);
      return json(response, 202, await store.handleWebhook(body));
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const served = await serveAppAsset(pathname, response, request.method);
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

function handleStream(pathname, request, response) {
  const slug = pathname.split("/")[3];
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  response.write(`event: availability.updated\ndata: ${JSON.stringify({ slug, at: new Date().toISOString() })}\n\n`);

  const heartbeat = setInterval(() => {
    response.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  store.addSseClient(slug, response);

  request.on("close", () => {
    clearInterval(heartbeat);
    store.removeSseClient(slug, response);
  });
}

function handleAdminStream(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  response.write(
    `event: booking.updated\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
  );

  const heartbeat = setInterval(() => {
    response.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  store.addAdminSseClient(response);

  request.on("close", () => {
    clearInterval(heartbeat);
    store.removeAdminSseClient(response);
  });
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function html(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(payload);
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function match(value, pattern) {
  return pattern.test(value);
}

async function serveAppAsset(pathname, response, method) {
  const normalized = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = safeJoinDist(normalized);
  if (filePath) {
    const asset = await tryReadFile(filePath);
    if (asset) {
      return file(response, 200, asset, getMimeType(filePath), method);
    }
  }

  if (path.extname(pathname)) {
    return false;
  }

  const indexPath = path.join(DIST_DIR, "index.html");
  const asset = await tryReadFile(indexPath);
  if (!asset) {
    return false;
  }

  return file(response, 200, asset, "text/html; charset=utf-8", method);
}

function safeJoinDist(relativePath) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = path.join(DIST_DIR, safePath);
  if (!candidate.startsWith(DIST_DIR)) {
    return null;
  }
  return candidate;
}

async function tryReadFile(filePath) {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

function file(response, status, payload, contentType, method) {
  response.writeHead(status, {
    "Content-Type": contentType,
  });
  if (method === "HEAD") {
    response.end();
    return true;
  }
  response.end(payload);
  return true;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function renderCallbackPage({ title, description, target = null, ctaLabel = "Retourner" }) {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f9f4ed;
        color: #001e5b;
      }
      main {
        width: min(34rem, calc(100vw - 2rem));
        padding: 2rem;
        border-radius: 1.5rem;
        border: 1px solid rgba(0, 30, 91, 0.08);
        background: #fffdf9;
        box-shadow: 0 18px 48px rgba(0, 30, 91, 0.1);
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }
      p {
        margin: 0 0 1rem;
        line-height: 1.6;
        color: rgba(0, 30, 91, 0.74);
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0.8rem 1.2rem;
        background: #f7a600;
        color: #001e5b;
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      ${
        target
          ? `<a href="${escapeHtml(target)}">${escapeHtml(ctaLabel)}</a>`
          : ""
      }
    </main>
  </body>
</html>`;
}

function decodeCallbackState(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
