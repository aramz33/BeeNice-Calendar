import { Hono } from "hono";

export function createCallerRouter(store) {
  const router = new Hono();

  router.get("/workspaces", (c) => {
    const workspaces = store.listPublicBookingLinks().map(
      ({ id, clientName: name, slug, timezone }) => ({ id, name, slug, timezone })
    );
    return c.json({ workspaces });
  });

  router.get("/tasks", (c) => {
    const session = c.get("session");
    const callerId = session?.user?.callerId;
    if (!callerId) return c.json({ tasks: [] });
    const { tasks } = store.listCallerTasks(callerId);
    return c.json({ tasks });
  });

  return router;
}
