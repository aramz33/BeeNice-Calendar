import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../app.mjs";

function createMockStore(overrides = {}) {
  return {
    listPublicBookingLinks: () => [],
    getPublicBookingPayload: () => ({}),
    listAvailability: async () => [],
    listCallerBookings: () => [],
    listCallerTasks: () => [],
    createBooking: async () => ({ id: "b1" }),
    cancelCallerBooking: async () => ({ ok: true }),
    listAdminBookings: () => [],
    listAdminCalendar: () => [],
    listAdminTasks: () => [],
    listSettings: () => ({}),
    getBookingDetail: () => ({ id: "b1" }),
    listBookingRescheduleAvailability: async () => [],
    updateBookingOutcome: async () => {},
    updateBookingSchedule: async () => {},
    updateTask: async () => {},
    createClient: () => ({ id: "c1" }),
    updateClient: () => ({ id: "c1" }),
    createCaller: () => ({ id: "ca1" }),
    updateCaller: () => ({ id: "ca1" }),
    startRepConnection: async () => ({ url: "https://nylas.example" }),
    finalizeRepConnection: async () => ({ callbackMode: "public_terminal", repId: "r1" }),
    listReps: () => [],
    handleWebhook: async () => ({ ok: true }),
    getPublicRepConnectionPayload: () => ({ repId: "r1" }),
    startPublicRepConnection: async () => ({ url: "https://nylas.example" }),
    addSseClient: () => {},
    removeSseClient: () => {},
    addAdminSseClient: () => {},
    removeAdminSseClient: () => {},
    getBookingLinkBySlug: () => null,
    ...overrides,
  };
}

function createMockProvider() {
  return {
    mode: "mock",
    getOverview: () => ({ providerMode: "mock", nylasConfigured: false }),
  };
}

// ── book-routes ───────────────────────────────────────────────────────────────

test("GET /api/book → 200 avec workspaces", async () => {
  const store = createMockStore({
    listPublicBookingLinks: () => [
      { id: "1", name: "TeamStarter", slug: "teamstarter-discovery", timezone: "Europe/Paris" },
    ],
  });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/book");

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, {
    workspaces: [{ id: "1", name: "TeamStarter", slug: "teamstarter-discovery", timezone: "Europe/Paris" }],
  });
});

test("GET /api/book/:slug → 200 avec payload du workspace", async () => {
  const payload = { slug: "test-slug", clientName: "Acme", reps: [] };
  const store = createMockStore({ getPublicBookingPayload: () => payload });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/book/test-slug");

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), payload);
});

test("GET /api/book/:slug/availability → 200, passe les query params", async () => {
  let capturedSlug, capturedCompanySize, capturedRange;
  const store = createMockStore({
    listAvailability: async (slug, companySize, range) => {
      capturedSlug = slug;
      capturedCompanySize = companySize;
      capturedRange = range;
      return [{ startAt: "2026-06-10T09:00:00Z" }];
    },
  });
  const app = createApp(store, createMockProvider());

  const res = await app.request(
    "/api/book/my-slug/availability?companySize=50&from=2026-06-10&to=2026-06-17",
  );

  assert.equal(res.status, 200);
  assert.equal(capturedSlug, "my-slug");
  assert.equal(capturedCompanySize, "50");
  assert.deepEqual(capturedRange, { from: "2026-06-10", to: "2026-06-17" });
});

test("POST /api/book/:slug/bookings → 201 avec booking créé", async () => {
  const booking = { id: "b42", slug: "test-slug" };
  const store = createMockStore({ createBooking: async () => booking });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/book/test-slug/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startAt: "2026-06-10T09:00:00Z", prospectName: "Alice" }),
  });

  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), booking);
});

// ── admin-routes ──────────────────────────────────────────────────────────────

test("GET /api/admin/bookings → 200 avec liste", async () => {
  const bookings = [{ id: "b1", status: "confirmed" }];
  let capturedFilters;
  const store = createMockStore({
    listAdminBookings: (filters) => {
      capturedFilters = filters;
      return bookings;
    },
  });
  const app = createApp(store, createMockProvider());

  const res = await app.request(
    "/api/admin/bookings?status=confirmed&clientId=c1",
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), bookings);
  assert.equal(capturedFilters.status, "confirmed");
  assert.equal(capturedFilters.clientId, "c1");
});

test("GET /api/admin/bookings/:id → 200 avec détail", async () => {
  const detail = { id: "b99", status: "confirmed", rep: "Alice" };
  const store = createMockStore({ getBookingDetail: () => detail });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/admin/bookings/b99");

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), detail);
});

test("PATCH /api/admin/bookings/:id/outcome → 200 { ok: true }", async () => {
  let capturedId, capturedState, capturedReason;
  const store = createMockStore({
    updateBookingOutcome: async (id, outcomeState, reason) => {
      capturedId = id;
      capturedState = outcomeState;
      capturedReason = reason;
    },
  });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/admin/bookings/b99/outcome", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcomeState: "qualified", reason: "Great fit" }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(capturedId, "b99");
  assert.equal(capturedState, "qualified");
  assert.equal(capturedReason, "Great fit");
});

test("PATCH /api/admin/tasks/:id avec assignedCallerId → appelle updateTask + 200", async () => {
  let capturedId, capturedPayload;
  const store = createMockStore({
    updateTask: async (id, payload) => {
      capturedId = id;
      capturedPayload = payload;
    },
  });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/admin/tasks/task-abc", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignedCallerId: "caller-florian" }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(capturedId, "task-abc");
  assert.equal(capturedPayload.assignedCallerId, "caller-florian");
});

// ── auth middleware ────────────────────────────────────────────────────────────

function createMockAuth(session = null) {
  return {
    api: { getSession: async () => session },
    handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  };
}

const adminSession = { user: { id: "u1", role: "admin", callerId: null, active: true } };
const callerSession = { user: { id: "u2", role: "caller", callerId: "caller-clotilde", active: true } };

test("GET /api/admin/bookings sans session → 401", async () => {
  const app = createApp(createMockStore(), createMockProvider(), createMockAuth(null));
  const res = await app.request("/api/admin/bookings");
  assert.equal(res.status, 401);
});

test("GET /api/admin/bookings avec session caller → 403", async () => {
  const app = createApp(createMockStore(), createMockProvider(), createMockAuth(callerSession));
  const res = await app.request("/api/admin/bookings");
  assert.equal(res.status, 403);
});

test("GET /api/admin/bookings avec session admin → 200", async () => {
  const app = createApp(createMockStore(), createMockProvider(), createMockAuth(adminSession));
  const res = await app.request("/api/admin/bookings");
  assert.equal(res.status, 200);
});

test("GET /api/book/:slug/bookings sans session → 401", async () => {
  const app = createApp(createMockStore(), createMockProvider(), createMockAuth(null));
  const res = await app.request("/api/book/teamstarter-discovery/bookings");
  assert.equal(res.status, 401);
});

test("GET /api/book/:slug/bookings avec session caller → callerId déduit de la session", async () => {
  let capturedCallerId;
  const store = createMockStore({
    listCallerBookings: (slug, callerId) => {
      capturedCallerId = callerId;
      return [{ id: "b1" }];
    },
  });
  const app = createApp(store, createMockProvider(), createMockAuth(callerSession));

  const res = await app.request("/api/book/teamstarter-discovery/bookings");

  assert.equal(res.status, 200);
  assert.equal(capturedCallerId, "caller-clotilde");
});

test("GET /api/book/:slug/tasks avec session caller → callerId déduit de la session", async () => {
  let capturedCallerId;
  const store = createMockStore({
    listCallerTasks: (callerId) => {
      capturedCallerId = callerId;
      return [];
    },
  });
  const app = createApp(store, createMockProvider(), createMockAuth(callerSession));

  const res = await app.request("/api/book/teamstarter-discovery/tasks");

  assert.equal(res.status, 200);
  assert.equal(capturedCallerId, "caller-clotilde");
});

// ── caller-routes ─────────────────────────────────────────────────────────────

test("GET /api/caller/workspaces sans session → 401", async () => {
  const app = createApp(createMockStore(), createMockProvider(), createMockAuth(null));
  const res = await app.request("/api/caller/workspaces");
  assert.equal(res.status, 401);
});

test("GET /api/caller/workspaces avec session caller → 200 + workspaces", async () => {
  const store = createMockStore({
    listPublicBookingLinks: () => [
      { id: "wk1", slug: "test-slug", clientId: "c1", clientName: "Acme", title: "Discovery", timezone: "Europe/Paris" },
    ],
  });
  const app = createApp(store, createMockProvider(), createMockAuth(callerSession));

  const res = await app.request("/api/caller/workspaces");

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.workspaces, [
    { id: "wk1", name: "Acme", slug: "test-slug", timezone: "Europe/Paris" },
  ]);
});

test("GET /api/caller/workspaces avec session admin → 200", async () => {
  const app = createApp(createMockStore(), createMockProvider(), createMockAuth(adminSession));
  const res = await app.request("/api/caller/workspaces");
  assert.equal(res.status, 200);
});

// ── error handling ────────────────────────────────────────────────────────────

test("Route inconnue → 404", async () => {
  const app = createApp(createMockStore(), createMockProvider());

  const res = await app.request("/api/inexistant");

  assert.equal(res.status, 404);
  const body = await res.json();
  assert.ok(body.error);
});

test("Erreur métier standard → 400 avec message", async () => {
  const store = createMockStore({
    createBooking: async () => {
      throw new Error("Créneau invalide");
    },
  });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/book/test-slug/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "Créneau invalide");
});

test("Erreur 'plus disponible' → 409", async () => {
  const store = createMockStore({
    createBooking: async () => {
      throw new Error("Ce créneau n'est plus disponible");
    },
  });
  const app = createApp(store, createMockProvider());

  const res = await app.request("/api/book/test-slug/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 409);
});
