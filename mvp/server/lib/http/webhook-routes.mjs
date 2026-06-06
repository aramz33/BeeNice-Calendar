import { Hono } from "hono";

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
    const body = await c.req.json().catch(() => ({}));
    return c.json(await store.handleWebhook(body), 202);
  });

  return router;
}
