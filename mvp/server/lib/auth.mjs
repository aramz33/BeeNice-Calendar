import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export function createAuth(dbPath) {
  if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET must be set in production.");
  }

  const webPort = process.env.MVP_WEB_PORT ?? "5174";
  const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",")
    : [`http://localhost:${webPort}`];

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production-32ch",
    trustedOrigins,
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
    session: { expiresIn: 60 * 60 * 5 },
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
