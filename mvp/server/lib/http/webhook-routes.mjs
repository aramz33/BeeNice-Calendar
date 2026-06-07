import { Hono } from "hono";
import { parseBody } from "./body.mjs";

export function createWebhookRouter(store) {
  const router = new Hono();

  router.get("/nylas", (c) => {
    const challenge = c.req.query("challenge");
    if (challenge) {
      return c.text(challenge);
    }
    return c.json({ ok: true });
  });

  router.post("/nylas", async (c) => {
    const body = await parseBody(c);
    return c.json(await store.handleWebhook(body), 202);
  });

  return router;
}
