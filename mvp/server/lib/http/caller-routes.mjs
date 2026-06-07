import { Hono } from "hono";

export function createCallerRouter(store) {
  const router = new Hono();

  router.get("/workspaces", (c) => {
    return c.json({ workspaces: store.listPublicBookingLinks() });
  });

  return router;
}
