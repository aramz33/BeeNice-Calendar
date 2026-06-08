import { Hono } from "hono";

export function createCallerRouter(store) {
  const router = new Hono();

  router.get("/workspaces", (c) => {
    const workspaces = store.listPublicBookingLinks().map(
      ({ id, clientName: name, slug, timezone }) => ({ id, name, slug, timezone })
    );
    return c.json({ workspaces });
  });

  return router;
}
