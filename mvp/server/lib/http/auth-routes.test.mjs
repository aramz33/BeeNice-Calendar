import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../app.mjs";
import { createAuth } from "../auth.mjs";
import { getDefaultDatabasePath } from "../database.mjs";
import { createCalendarProvider } from "../provider.mjs";
import { seedAuthUsers } from "../seed-users.mjs";
import { createStore } from "../state.mjs";

test("POST /api/auth/sign-out accepts 127.0.0.1 web origin and clears session cookies", async (t) => {
  const previousDbPath = process.env.MVP_DB_PATH;
  const previousTrustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-auth-routes-"));
  process.env.MVP_DB_PATH = path.join(tempDir, "mvp.sqlite");
  process.env.BETTER_AUTH_TRUSTED_ORIGINS =
    "http://localhost:5174,http://127.0.0.1:8787";

  const provider = createCalendarProvider("mock");
  const store = createStore(provider);
  const dbPath = path.resolve(process.env.MVP_DB_PATH ?? getDefaultDatabasePath());
  const auth = createAuth(dbPath);
  await seedAuthUsers(auth, dbPath);
  const app = createApp(store, provider, auth);

  t.after(() => {
    store.close();
    if (previousDbPath === undefined) {
      delete process.env.MVP_DB_PATH;
    } else {
      process.env.MVP_DB_PATH = previousDbPath;
    }
    if (previousTrustedOrigins === undefined) {
      delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    } else {
      process.env.BETTER_AUTH_TRUSTED_ORIGINS = previousTrustedOrigins;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const origin = "http://127.0.0.1:5174";
  const signInResponse = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      email: "julien@beeniceagency.com",
      password: "changeme",
    }),
  });
  assert.equal(signInResponse.status, 200);

  const sessionCookie = signInResponse.headers.get("set-cookie")?.split(";")[0];
  assert.ok(sessionCookie);

  const signOutResponse = await app.request("/api/auth/sign-out", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie,
      origin,
    },
    body: JSON.stringify({}),
  });

  assert.equal(signOutResponse.status, 200);
  assert.match(
    signOutResponse.headers.get("set-cookie") ?? "",
    /better-auth\.session_token=; Max-Age=0/,
  );
  assert.deepEqual(await signOutResponse.json(), { success: true });

  const sessionResponse = await app.request("/api/auth/get-session", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal(await sessionResponse.json(), null);
});
