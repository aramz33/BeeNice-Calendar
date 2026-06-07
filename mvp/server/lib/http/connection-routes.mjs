import { Hono } from "hono";
import { parseBody } from "./body.mjs";

export function createConnectionRouter(store) {
  const router = new Hono();

  router.get("/:id", (c) => {
    return c.json(store.getPublicRepConnectionPayload(c.req.param("id")));
  });

  router.post("/:id/start", async (c) => {
    const body = await parseBody(c);
    return c.json(await store.startPublicRepConnection(c.req.param("id"), body));
  });

  return router;
}
