import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export function createAuth(dbPath) {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production-32ch",
    database: new Database(dbPath),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "caller",
          input: true,
        },
        active: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: true,
        },
        callerId: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7 },
  });
}

export function requireAuth(auth) {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    c.set("session", session);
    await next();
  };
}

export function requireAdmin(auth) {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (session.user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
    c.set("session", session);
    await next();
  };
}
