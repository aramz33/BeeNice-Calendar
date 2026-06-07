import { HTTPException } from "hono/http-exception";

export async function parseBody(c) {
  const text = await c.req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: "Corps de requête JSON invalide." });
  }
}
