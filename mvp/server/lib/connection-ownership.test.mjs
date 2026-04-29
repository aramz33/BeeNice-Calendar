import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCalendarProvider } from "./provider.mjs";
import { getDefaultDatabasePath } from "./database.mjs";
import { createStore } from "./state.mjs";

function withTempStore(t, provider) {
  const previousDbPath = process.env.MVP_DB_PATH;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-calendar-"));
  process.env.MVP_DB_PATH = path.join(tempDir, "mvp.sqlite");
  const store = createStore(provider);

  t.after(() => {
    store.close();
    if (previousDbPath === undefined) {
      delete process.env.MVP_DB_PATH;
    } else {
      process.env.MVP_DB_PATH = previousDbPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  return store;
}

function createProviderStub(mode = "nylas") {
  return {
    mode,
    getOverview() {
      return {
        providerMode: mode,
        nylasConfigured: mode !== "nylas",
      };
    },
    async startRepConnection() {
      throw new Error("Not implemented in test stub.");
    },
    async finalizeRepConnection() {
      throw new Error("Not implemented in test stub.");
    },
    async listBusyIntervals() {
      return [];
    },
    async createExternalEvent(_store, _rep, booking) {
      return `test-${booking.id}`;
    },
    async fetchExternalEvent(_store, booking) {
      return {
        id: booking.externalEventId,
        startAt: new Date(booking.startAt),
        endAt: new Date(booking.endAt),
      };
    },
    async releaseExternalEvent() {},
  };
}

test("claimCalendarConnection disconnects the previous owner and isolates workspace reps", (t) => {
  const store = withTempStore(t, createProviderStub());
  const { client, workspace } = store.createClient({
    name: "Doctolib Test",
    timezone: "Europe/Paris",
    routingMode: "pool_unique",
  });
  const newRep = store.createRep({
    clientId: client.id,
    name: "Rep Test",
    email: "rep.test@example.com",
    seniority: "non_defini",
    timezone: "Europe/Paris",
    active: true,
  });

  store.upsertConnection("rep-quentin", {
    provider: "nylas",
    providerEmail: "quentin@teamstarter.com",
    providerGrantId: "grant-admin",
    providerAccountId: "account-admin",
    bookingCalendarId: "primary",
    status: "connected",
    connectedAt: "2026-04-24T10:00:00.000Z",
    lastSyncAt: "2026-04-24T10:00:00.000Z",
  });

  const claimed = store.claimCalendarConnection(newRep.id, {
    providerEmail: "admin@gmail.com",
    providerGrantId: "grant-admin",
    providerAccountId: "account-admin",
    bookingCalendarId: "primary",
    connectedAt: "2026-04-25T10:00:00.000Z",
    lastSyncAt: "2026-04-25T10:00:00.000Z",
  });

  assert.deepEqual(claimed.disconnectedRepIds, ["rep-quentin"]);
  assert.ok(claimed.affectedClientIds.includes("client-teamstarter"));
  assert.ok(claimed.affectedClientIds.includes(client.id));

  const previousOwner = store.getConnection("rep-quentin");
  assert.equal(previousOwner.status, "disconnected");
  assert.equal(previousOwner.providerGrantId, null);
  assert.equal(previousOwner.providerEmail, null);

  const newOwner = store.getConnection(newRep.id);
  assert.equal(newOwner.status, "connected");
  assert.equal(newOwner.providerGrantId, "grant-admin");
  assert.equal(newOwner.providerEmail, "admin@gmail.com");

  const teamstarterRepIds = store
    .getRepsForLink("booking-link-teamstarter")
    .map((rep) => rep.id);
  assert.ok(!teamstarterRepIds.includes("rep-quentin"));

  const doctolibRepIds = store.getRepsForLink(workspace.id).map((rep) => rep.id);
  assert.deepEqual(doctolibRepIds, [newRep.id]);
});

test("nylas mode ignores stale mock connections marked connected", (t) => {
  const store = withTempStore(t, createProviderStub());

  store.upsertConnection("rep-quentin", {
    provider: "mock",
    providerEmail: "quentin@teamstarter.com",
    providerGrantId: "mock-grant-rep-quentin",
    providerAccountId: "mock-account-rep-quentin",
    bookingCalendarId: "primary",
    status: "connected",
    connectedAt: "2026-04-24T10:00:00.000Z",
    lastSyncAt: "2026-04-24T10:00:00.000Z",
  });

  assert.deepEqual(store.getRepsForLink("booking-link-teamstarter"), []);

  const rep = store.listReps().find((item) => item.id === "rep-quentin");
  assert.equal(rep.connectionStatus, "disconnected");
});

test("startRepConnection clears stale grants when moving a rep to auth_required", async (t) => {
  const previousApiKey = process.env.MVP_NYLAS_API_KEY;
  const previousClientId = process.env.MVP_NYLAS_CLIENT_ID;
  const previousCallbackUrl = process.env.MVP_NYLAS_CALLBACK_URL;
  process.env.MVP_NYLAS_API_KEY = "test-api-key";
  process.env.MVP_NYLAS_CLIENT_ID = "test-client-id";
  process.env.MVP_NYLAS_CALLBACK_URL = "http://localhost:8787/callback";
  t.after(() => {
    if (previousApiKey === undefined) {
      delete process.env.MVP_NYLAS_API_KEY;
    } else {
      process.env.MVP_NYLAS_API_KEY = previousApiKey;
    }
    if (previousClientId === undefined) {
      delete process.env.MVP_NYLAS_CLIENT_ID;
    } else {
      process.env.MVP_NYLAS_CLIENT_ID = previousClientId;
    }
    if (previousCallbackUrl === undefined) {
      delete process.env.MVP_NYLAS_CALLBACK_URL;
    } else {
      process.env.MVP_NYLAS_CALLBACK_URL = previousCallbackUrl;
    }
  });

  const provider = createCalendarProvider("nylas");
  const store = withTempStore(t, provider);

  store.upsertConnection("rep-quentin", {
    provider: "nylas",
    providerEmail: "admin@gmail.com",
    providerGrantId: "grant-old",
    providerAccountId: "account-old",
    bookingCalendarId: "primary",
    status: "connected",
    connectedAt: "2026-04-24T10:00:00.000Z",
    lastSyncAt: "2026-04-24T10:00:00.000Z",
  });

  await provider.startRepConnection(store, "rep-quentin", { provider: "google" });

  const connection = store.getConnection("rep-quentin");
  assert.equal(connection.status, "auth_required");
  assert.equal(connection.providerEmail, null);
  assert.equal(connection.providerGrantId, null);
  assert.equal(connection.providerAccountId, null);
  assert.equal(connection.bookingCalendarId, null);
  assert.equal(connection.connectedAt, null);
  assert.ok(connection.authUrl);
});

test("default database path is anchored to the server directory", () => {
  const expected = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../data/mvp.sqlite",
  );

  assert.equal(getDefaultDatabasePath(), expected);
});
