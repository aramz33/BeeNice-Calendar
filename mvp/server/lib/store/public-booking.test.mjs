import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { subDays, addDays } from "date-fns";
import { createStore } from "../state.mjs";

function withTempStore(t, provider = createProviderStub()) {
  const previousDbPath = process.env.MVP_DB_PATH;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-pubbook-"));
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

function createProviderStub(mode = "mock") {
  return {
    mode,
    getOverview() { return { providerMode: mode, nylasConfigured: false }; },
    async startRepConnection() { throw new Error("stub"); },
    async finalizeRepConnection() { throw new Error("stub"); },
    async listBusyIntervals() { return []; },
    async createExternalEvent(_s, _r, booking) { return `test-${booking.id}`; },
    async fetchExternalEvent(_s, booking) {
      return { id: booking.externalEventId, startAt: new Date(booking.startAt), endAt: new Date(booking.endAt) };
    },
    async releaseExternalEvent() {},
  };
}

async function createTestBooking(store, overrides = {}) {
  const availability = await store.listAvailability("teamstarter-discovery", "80");
  const slot = availability.slots[0];
  assert.ok(slot, "expected at least one available slot");
  return store.createBooking("teamstarter-discovery", {
    callerId: "caller-clotilde",
    companySize: 80,
    companyName: "TestCo",
    prospectName: "Jane Prospect",
    prospectEmail: "jane@example.com",
    notes: null,
    slotStart: slot.startAt,
    ...overrides,
  });
}

// ─── getPublicBookingPayload ──────────────────────────────────────────────────

test("getPublicBookingPayload throws for unknown slug", (t) => {
  const store = withTempStore(t);
  assert.throws(
    () => store.getPublicBookingPayload("nonexistent-slug"),
    /Booking link introuvable/,
  );
});

test("getPublicBookingPayload returns booking link with client info", (t) => {
  const store = withTempStore(t);
  const payload = store.getPublicBookingPayload("teamstarter-discovery");
  assert.equal(payload.bookingLink.slug, "teamstarter-discovery");
  assert.equal(payload.bookingLink.clientName, "TeamStarter");
  assert.ok(Array.isArray(payload.bookingLink.reps));
  assert.ok(payload.bookingLink.reps.length > 0);
});

test("getPublicBookingPayload includes callers and workspaces", (t) => {
  const store = withTempStore(t);
  const payload = store.getPublicBookingPayload("teamstarter-discovery");
  assert.ok(Array.isArray(payload.callers));
  assert.ok(payload.callers.length > 0);
  assert.ok(Array.isArray(payload.workspaces));
});

// ─── listCallerBookings ───────────────────────────────────────────────────────

test("listCallerBookings throws for unknown slug", (t) => {
  const store = withTempStore(t);
  assert.throws(
    () => store.listCallerBookings("nonexistent-slug", "caller-clotilde"),
    /Booking link introuvable/,
  );
});

test("listCallerBookings returns timezone and empty bookings for caller with no bookings", (t) => {
  const store = withTempStore(t);
  const result = store.listCallerBookings("teamstarter-discovery", "caller-clotilde");
  assert.ok(result.timezone, "expected a timezone");
  assert.ok(Array.isArray(result.bookings));
  assert.ok(Array.isArray(result.tasks));
});

test("listCallerBookings separates upcoming from historical bookings", async (t) => {
  const store = withTempStore(t);

  const { bookingId } = await createTestBooking(store);

  const result = store.listCallerBookings("teamstarter-discovery", "caller-clotilde");
  assert.ok(Array.isArray(result.bookings));

  const booking = result.bookings.find((b) => b.id === bookingId);
  assert.ok(booking, "created booking should appear in the list");
});

test("listCallerBookings returns only the caller's bookings, not others", async (t) => {
  const store = withTempStore(t);
  await createTestBooking(store);

  const result = store.listCallerBookings("teamstarter-discovery", "caller-unknown");
  assert.equal(result.bookings.length, 0);
});

test("listCallerBookings caps historical bookings at 6", async (t) => {
  const store = withTempStore(t);

  // Create a booking then cancel it (moves to historical)
  const { bookingId } = await createTestBooking(store);
  await store.cancelCallerBooking("teamstarter-discovery", "caller-clotilde", bookingId);

  const result = store.listCallerBookings("teamstarter-discovery", "caller-clotilde");
  assert.ok(result.bookings.length <= 6 + result.bookings.filter(
    (b) => b.scheduleState !== "cancelled"
  ).length, "historical bookings capped at 6");
});

test("listCallerBookings includes open tasks for the caller", async (t) => {
  const store = withTempStore(t);
  const result = store.listCallerBookings("teamstarter-discovery", "caller-clotilde");
  assert.ok(Array.isArray(result.tasks));
});
