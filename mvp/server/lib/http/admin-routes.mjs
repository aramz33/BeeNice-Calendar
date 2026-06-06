import { Hono } from "hono";

export function createAdminRouter(store, provider) {
  const router = new Hono();

  router.get("/reps", (c) => {
    return c.json({ reps: store.listReps(), integrations: provider.getOverview() });
  });

  router.get("/bookings", (c) => {
    return c.json(
      store.listAdminBookings({
        status: c.req.query("status"),
        clientId: c.req.query("clientId"),
        callerId: c.req.query("callerId"),
        repId: c.req.query("repId"),
        query: c.req.query("query"),
      }),
    );
  });

  router.get("/calendar", (c) => {
    return c.json(
      store.listAdminCalendar({
        from: c.req.query("from"),
        to: c.req.query("to"),
        status: c.req.query("status"),
        clientId: c.req.query("clientId"),
        callerId: c.req.query("callerId"),
        repId: c.req.query("repId"),
        query: c.req.query("query"),
      }),
    );
  });

  router.get("/tasks", (c) => {
    return c.json(
      store.listAdminTasks({
        clientId: c.req.query("clientId"),
        callerId: c.req.query("callerId"),
        query: c.req.query("query"),
      }),
    );
  });

  router.get("/settings", (c) => {
    return c.json(store.listSettings());
  });

  router.get("/bookings/:id/availability", async (c) => {
    return c.json(
      await store.listBookingRescheduleAvailability(c.req.param("id"), {
        from: c.req.query("from"),
        to: c.req.query("to"),
      }),
    );
  });

  router.get("/bookings/:id", (c) => {
    return c.json(store.getBookingDetail(c.req.param("id")));
  });

  router.patch("/bookings/:id/outcome", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    await store.updateBookingOutcome(c.req.param("id"), body.outcomeState, body.reason);
    return c.json({ ok: true });
  });

  router.patch("/bookings/:id/schedule", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    await store.updateBookingSchedule(
      c.req.param("id"),
      body.scheduleState,
      body.reason,
      body.nextStartAt,
    );
    return c.json({ ok: true });
  });

  router.patch("/tasks/:id", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    await store.updateTask(c.req.param("id"), body);
    return c.json({ ok: true });
  });

  router.post("/settings/clients", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(store.createClient(body), 201);
  });

  router.patch("/settings/clients/:id", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(store.updateClient(c.req.param("id"), body));
  });

  router.post("/settings/callers", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(store.createCaller(body), 201);
  });

  router.patch("/settings/callers/:id", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(store.updateCaller(c.req.param("id"), body));
  });

  router.post("/reps/:id/connect-nylas/start", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(await store.startRepConnection(c.req.param("id"), body));
  });

  router.post("/reps/:id/connect-nylas", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(await store.startRepConnection(c.req.param("id"), body));
  });

  router.get("/integrations/nylas/callback", async (c) => {
    const searchParams = new URL(c.req.url).searchParams;
    try {
      const result = await store.finalizeRepConnection(searchParams);
      return c.html(
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
      const state = decodeCallbackState(searchParams.get("state"));
      return c.html(
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
        400,
      );
    }
  });

  return router;
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
      h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
      p { margin: 0 0 1rem; line-height: 1.6; color: rgba(0, 30, 91, 0.74); }
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
      ${target ? `<a href="${escapeHtml(target)}">${escapeHtml(ctaLabel)}</a>` : ""}
    </main>
  </body>
</html>`;
}

function decodeCallbackState(value) {
  if (!value) return null;
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
