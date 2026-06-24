import { Hono } from "hono";
import { parseBody } from "./body.mjs";

export function createBookRouter(store) {
  const router = new Hono();

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

  router.post("/:slug/bookings", async (c) => {
    const body = await parseBody(c);
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
