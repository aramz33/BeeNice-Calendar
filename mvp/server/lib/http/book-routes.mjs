import { Hono } from "hono";

export function createBookRouter(store) {
  const router = new Hono();

  router.get("/", (c) => {
    return c.json({ workspaces: store.listPublicBookingLinks() });
  });

  router.get("/:slug", (c) => {
    return c.json(store.getPublicBookingPayload(c.req.param("slug")));
  });

  router.get("/:slug/availability", async (c) => {
    const slots = await store.listAvailability(
      c.req.param("slug"),
      c.req.query("companySize"),
      { from: c.req.query("from"), to: c.req.query("to") },
    );
    return c.json(slots);
  });

  router.get("/:slug/bookings", (c) => {
    const callerId = c.get("session")?.user?.callerId;
    return c.json(store.listCallerBookings(c.req.param("slug"), callerId));
  });

  router.get("/:slug/tasks", (c) => {
    const callerId = c.get("session")?.user?.callerId;
    const bookingLink = store.getBookingLinkBySlug(c.req.param("slug"));
    return c.json(store.listCallerTasks(callerId, bookingLink?.clientId ?? null));
  });

  router.post("/:slug/bookings", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const booking = await store.createBooking(c.req.param("slug"), body);
    return c.json(booking, 201);
  });

  router.post("/:slug/bookings/:bookingId/cancel", async (c) => {
    const callerId = c.get("session")?.user?.callerId;
    const result = await store.cancelCallerBooking(
      c.req.param("slug"),
      callerId,
      c.req.param("bookingId"),
    );
    return c.json(result);
  });

  return router;
}
