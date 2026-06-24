import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createAuth } from "./auth.mjs";
import { getDefaultDatabasePath } from "./database.mjs";
import { createCalendarProvider } from "./provider.mjs";
import { seedAuthUsers } from "./seed-users.mjs";
import { createStore } from "./state.mjs";

function withTempAuthApp(t) {
  const previousDbPath = process.env.MVP_DB_PATH;
  const previousAdminPassword = process.env.ADMIN_SEED_PASSWORD;
  const previousCallerPassword = process.env.CALLER_SEED_PASSWORD;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-seed-users-"));
  process.env.MVP_DB_PATH = path.join(tempDir, "mvp.sqlite");
  process.env.ADMIN_SEED_PASSWORD = "new-admin-pass";
  process.env.CALLER_SEED_PASSWORD = "caller-pass";

  const provider = createCalendarProvider("mock");
  const store = createStore(provider);
  const dbPath = path.resolve(process.env.MVP_DB_PATH ?? getDefaultDatabasePath());
  const auth = createAuth(dbPath);
  const app = createApp(store, provider, auth);

  t.after(() => {
    store.close();
    if (previousDbPath === undefined) {
      delete process.env.MVP_DB_PATH;
    } else {
      process.env.MVP_DB_PATH = previousDbPath;
    }
    if (previousAdminPassword === undefined) {
      delete process.env.ADMIN_SEED_PASSWORD;
    } else {
      process.env.ADMIN_SEED_PASSWORD = previousAdminPassword;
    }
    if (previousCallerPassword === undefined) {
      delete process.env.CALLER_SEED_PASSWORD;
    } else {
      process.env.CALLER_SEED_PASSWORD = previousCallerPassword;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  return { app, auth, dbPath };
}

test("seedAuthUsers repairs partial auth seed and links caller rows", async (t) => {
  const { app, auth, dbPath } = withTempAuthApp(t);
  const ctx = await auth.$context;
  await ctx.runMigrations();

  await auth.api.signUpEmail({
    body: {
      email: "julien@beeniceagency.com",
      password: "original-admin-pass",
      name: "Julien Bouic",
      role: "admin",
      active: true,
    },
  });

  let db = new Database(dbPath);
  try {
    assert.deepEqual(
      db.prepare('SELECT email FROM "user" ORDER BY email').all(),
      [{ email: "julien@beeniceagency.com" }],
    );
    assert.deepEqual(
      db.prepare("SELECT id, user_id FROM callers ORDER BY id").all(),
      [
        { id: "caller-clotilde", user_id: null },
        { id: "caller-florian", user_id: null },
      ],
    );
  } finally {
    db.close();
  }

  await seedAuthUsers(auth, dbPath);
  await seedAuthUsers(auth, dbPath);

  db = new Database(dbPath);
  try {
    assert.deepEqual(
      db
        .prepare('SELECT email, role, callerId FROM "user" ORDER BY email')
        .all(),
      [
        {
          email: "clotilde@beeniceagency.com",
          role: "caller",
          callerId: "caller-clotilde",
        },
        {
          email: "florian@beeniceagency.com",
          role: "caller",
          callerId: "caller-florian",
        },
        {
          email: "julien@beeniceagency.com",
          role: "admin",
          callerId: null,
        },
      ],
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "user"').get().count, 3);
    assert.deepEqual(
      db
        .prepare(`
          SELECT callers.id, "user".email
          FROM callers
          LEFT JOIN "user" ON "user".id = callers.user_id
          ORDER BY callers.id
        `)
        .all(),
      [
        {
          id: "caller-clotilde",
          email: "clotilde@beeniceagency.com",
        },
        {
          id: "caller-florian",
          email: "florian@beeniceagency.com",
        },
      ],
    );
  } finally {
    db.close();
  }

  const adminSignIn = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "julien@beeniceagency.com",
      password: "original-admin-pass",
    }),
  });
  assert.equal(adminSignIn.status, 200);

  const callerSignIn = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "florian@beeniceagency.com",
      password: "caller-pass",
    }),
  });
  assert.equal(callerSignIn.status, 200);
});
