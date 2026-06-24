import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "./state.mjs";

const TEST_NOW = "2030-01-07T09:00:00.000Z";

function withTempStore(t, provider) {
  const previousDbPath = process.env.MVP_DB_PATH;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-calendar-"));
  process.env.MVP_DB_PATH = path.join(tempDir, "mvp.sqlite");
  const store = createStore(provider, { now: TEST_NOW });

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

async function createBookingFromFirstAvailableSlot(store, overrides = {}) {
  const availability = await store.listAvailability("teamstarter-discovery", "80");
  const slot = availability.slots[0];
  assert.ok(slot, "expected at least one seeded slot");

  return store.createBooking("teamstarter-discovery", {
    callerId: "caller-clotilde",
    companySize: 80,
    companyName: "ACME",
    prospectName: "Jane Doe",
    prospectEmail: "jane@example.com",
    notes: "Booking created in test.",
    slotStart: slot.startAt,
    ...overrides,
  });
}

test("getPublicBookingPayload exposes the current workspace and the public workspace list", (t) => {
  const store = withTempStore(t, createProviderStub());

  const payload = store.getPublicBookingPayload("teamstarter-discovery");

  assert.equal(payload.bookingLink.slug, "teamstarter-discovery");
  assert.equal(payload.bookingLink.clientName, "TeamStarter");
  assert.equal(payload.workspaces.length, 2);
  assert.deepEqual(
    payload.workspaces.map((workspace) => workspace.slug),
    ["doctolib-discovery", "teamstarter-discovery"],
  );

  const adminPayload = store.listAdminBookings();
  assert.equal(adminPayload.integrations.providerMode, "mock");
  assert.ok(adminPayload.filters.clients.some((client) => client.id === "client-teamstarter"));
  assert.ok(adminPayload.filters.reps.some((rep) => rep.id === "rep-quentin"));
});

test("createBooking persists the booking and closes the source follow-up task", async (t) => {
  const store = withTempStore(t, createProviderStub());
  const sourceTask = store.listCallerTasks("caller-clotilde", "client-teamstarter").tasks[0];
  assert.ok(sourceTask, "expected an open seeded follow-up task");

  const result = await createBookingFromFirstAvailableSlot(store, {
    sourceTaskId: sourceTask.id,
  });

  const detail = store.getBookingDetail(result.bookingId);
  assert.equal(detail.booking.companyName, "ACME");
  assert.equal(detail.booking.callerId, "caller-clotilde");
  assert.match(detail.booking.externalEventId, /^test-booking-/);

  const completedTask = store.getTask(sourceTask.id);
  assert.equal(completedTask.status, "done");
  assert.equal(completedTask.replacementBookingId, result.bookingId);
});

test("booking créé → prospectRsvpState vaut 'pending'", async (t) => {
  const store = withTempStore(t, createProviderStub());
  const sourceTask = store.listCallerTasks("caller-clotilde", "client-teamstarter").tasks[0];
  const result = await createBookingFromFirstAvailableSlot(store, { sourceTaskId: sourceTask.id });
  const detail = store.getBookingDetail(result.bookingId);
  assert.equal(detail.booking.prospectRsvpState, "pending");
});

test("admin reschedule updates schedule metadata and preserves provider event ownership", async (t) => {
  const store = withTempStore(t, createProviderStub());
  const result = await createBookingFromFirstAvailableSlot(store);
  const bookingBefore = store.getBooking(result.bookingId);

  const availability = await store.listBookingRescheduleAvailability(result.bookingId);
  const nextSlot = availability.slots.find((slot) => slot.startAt !== bookingBefore.startAt);
  assert.ok(nextSlot, "expected an alternative slot for reschedule");

  await store.updateBookingSchedule(
    result.bookingId,
    "rescheduled",
    "Move to a different slot.",
    nextSlot.startAt,
  );

  const bookingAfter = store.getBooking(result.bookingId);
  assert.equal(bookingAfter.scheduleState, "rescheduled");
  assert.equal(bookingAfter.previousStartAt, bookingBefore.startAt);
  assert.equal(bookingAfter.startAt, nextSlot.startAt);
  assert.match(bookingAfter.externalEventId, /^test-booking-/);
});

test("caller cancellation keeps direct-cancel behavior and marks the booking cancelled", async (t) => {
  const store = withTempStore(t, createProviderStub());
  const result = await createBookingFromFirstAvailableSlot(store);

  await store.cancelCallerBooking(
    "teamstarter-discovery",
    "caller-clotilde",
    result.bookingId,
  );

  const booking = store.getBooking(result.bookingId);
  assert.equal(booking.scheduleState, "cancelled");
  assert.equal(store.getCallerCancelMode(booking), null);
});

test("outcome MVN sets the disposition and spawns a reposition task", async (t) => {
  const store = withTempStore(t, createProviderStub());
  const result = await createBookingFromFirstAvailableSlot(store);

  await store.updateBookingOutcome(result.bookingId, "mvn", "Mauvais numéro.");

  const booking = store.getBooking(result.bookingId);
  assert.equal(booking.outcomeState, "mvn");
  assert.equal(store.getDisplayStatus(booking), "mvn");

  const task = store.getOpenTaskByBookingId(result.bookingId);
  assert.ok(task, "expected MVN to spawn a reposition task");
  assert.equal(task.triggerReason, "mvn");
});

test("outcome Refus sets the disposition and is terminal (no reposition task)", async (t) => {
  const store = withTempStore(t, createProviderStub());
  const result = await createBookingFromFirstAvailableSlot(store);

  await store.updateBookingOutcome(result.bookingId, "refused", "Prospect refuse.");

  const booking = store.getBooking(result.bookingId);
  assert.equal(booking.outcomeState, "refused");
  assert.equal(store.getDisplayStatus(booking), "refused");
  assert.equal(store.getOpenTaskByBookingId(result.bookingId), null);
});
