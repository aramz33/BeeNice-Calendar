import { html, json, match, parseBody, segment } from "./helpers.mjs";

export async function handleAdminRoutes({
  pathname,
  request,
  response,
  store,
  provider,
  url,
}) {
  if (request.method === "GET" && pathname === "/api/admin/reps") {
    json(response, 200, {
      reps: store.listReps(),
      integrations: provider.getOverview(),
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/admin/bookings") {
    json(
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
    return true;
  }

  if (request.method === "GET" && pathname === "/api/admin/calendar") {
    json(
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
    return true;
  }

  if (request.method === "GET" && pathname === "/api/admin/tasks") {
    json(
      response,
      200,
      store.listAdminTasks({
        clientId: url.searchParams.get("clientId"),
        callerId: url.searchParams.get("callerId"),
        query: url.searchParams.get("query"),
      }),
    );
    return true;
  }

  if (request.method === "GET" && pathname === "/api/admin/settings") {
    json(response, 200, store.listSettings());
    return true;
  }

  if (
    request.method === "GET" &&
    match(pathname, /^\/api\/admin\/bookings\/([^/]+)$/)
  ) {
    json(response, 200, store.getBookingDetail(segment(pathname, 4)));
    return true;
  }

  if (
    request.method === "GET" &&
    match(pathname, /^\/api\/admin\/bookings\/([^/]+)\/availability$/)
  ) {
    json(
      response,
      200,
      await store.listBookingRescheduleAvailability(segment(pathname, 4), {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      }),
    );
    return true;
  }

  if (
    request.method === "PATCH" &&
    match(pathname, /^\/api\/admin\/bookings\/([^/]+)\/outcome$/)
  ) {
    const body = await parseBody(request);
    await store.updateBookingOutcome(
      segment(pathname, 4),
      body.outcomeState,
      body.reason,
    );
    json(response, 200, { ok: true });
    return true;
  }

  if (
    request.method === "PATCH" &&
    match(pathname, /^\/api\/admin\/bookings\/([^/]+)\/schedule$/)
  ) {
    const body = await parseBody(request);
    await store.updateBookingSchedule(
      segment(pathname, 4),
      body.scheduleState,
      body.reason,
      body.nextStartAt,
    );
    json(response, 200, { ok: true });
    return true;
  }

  if (
    request.method === "PATCH" &&
    match(pathname, /^\/api\/admin\/tasks\/([^/]+)$/)
  ) {
    await store.updateTask(segment(pathname, 4), await parseBody(request));
    json(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/admin/settings/clients") {
    json(response, 201, store.createClient(await parseBody(request)));
    return true;
  }

  if (
    request.method === "PATCH" &&
    match(pathname, /^\/api\/admin\/settings\/clients\/([^/]+)$/)
  ) {
    json(
      response,
      200,
      store.updateClient(segment(pathname, 5), await parseBody(request)),
    );
    return true;
  }

  if (request.method === "POST" && pathname === "/api/admin/settings/callers") {
    json(response, 201, store.createCaller(await parseBody(request)));
    return true;
  }

  if (
    request.method === "PATCH" &&
    match(pathname, /^\/api\/admin\/settings\/callers\/([^/]+)$/)
  ) {
    json(
      response,
      200,
      store.updateCaller(segment(pathname, 5), await parseBody(request)),
    );
    return true;
  }

  if (
    request.method === "POST" &&
    match(pathname, /^\/api\/admin\/reps\/([^/]+)\/connect-nylas\/start$/)
  ) {
    json(
      response,
      200,
      await store.startRepConnection(segment(pathname, 4), await parseBody(request)),
    );
    return true;
  }

  if (
    request.method === "POST" &&
    match(pathname, /^\/api\/admin\/reps\/([^/]+)\/connect-nylas$/)
  ) {
    json(
      response,
      200,
      await store.startRepConnection(segment(pathname, 4), await parseBody(request)),
    );
    return true;
  }

  if (
    request.method === "GET" &&
    pathname === "/api/admin/integrations/nylas/callback"
  ) {
    try {
      const result = await store.finalizeRepConnection(url.searchParams);
      html(
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
              : `/admin/settings/connections?connected=${encodeURIComponent(result.repId)}`,
          ctaLabel: "Retourner à la console admin",
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connexion Nylas impossible.";
      const state = decodeCallbackState(url.searchParams.get("state"));
      html(
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
              : `/admin/settings/connections?connectionError=${encodeURIComponent(message)}`,
          ctaLabel: "Retourner à la console admin",
        }),
      );
    }
    return true;
  }

  return false;
}

function renderCallbackPage({
  title,
  description,
  target = null,
  ctaLabel = "Retourner",
}) {
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
