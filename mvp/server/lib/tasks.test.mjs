import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addDays } from "date-fns";
import { createStore } from "./state.mjs";

const TEST_NOW = "2030-01-07T09:00:00.000Z";

function withTempStore(t, provider = createProviderStub()) {
  const previousDbPath = process.env.MVP_DB_PATH;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-tasks-"));
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
    prospectName: "Test Prospect",
    prospectEmail: "test@example.com",
    notes: null,
    slotStart: slot.startAt,
    ...overrides,
  });
}

test("ensureFollowUpTask returns existing open task instead of creating duplicate", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);

  const first = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.ok(first, "expected a task to be created");

  const second = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.equal(first.id, second.id, "should return the same task");
});

test("ensureFollowUpTask returns null when booking does not exist", (t) => {
  const store = withTempStore(t);
  const result = store.ensureFollowUpTask("booking-nonexistent", "cancelled");
  assert.equal(result, null);
});

test("completeTask returns null when task does not exist", (t) => {
  const store = withTempStore(t);
  const result = store.completeTask("task-nonexistent", "booking-nonexistent");
  assert.equal(result, null);
});

test("completeTask marks task as done and links replacement booking", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);

  const task = store.ensureFollowUpTask(bookingId, "no_show");
  assert.ok(task);

  const result1 = await createTestBooking(store);
  const completedTask = store.completeTask(task.id, result1.bookingId);

  assert.equal(completedTask.status, "done");
  assert.equal(completedTask.replacementBookingId, result1.bookingId);
});

test("updateTask throws when task does not exist", (t) => {
  const store = withTempStore(t);
  assert.throws(
    () => store.updateTask("task-nonexistent", {}),
    /Tâche introuvable/,
  );
});

test("updateTask throws for invalid status", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);
  const task = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.ok(task);

  assert.throws(
    () => store.updateTask(task.id, { status: "invalid_status" }),
    /Statut de tâche invalide/,
  );
});

test("updateTask marks task as dismissed", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);
  const task = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.ok(task);

  const result = store.updateTask(task.id, { status: "dismissed" });
  assert.deepEqual(result, { ok: true });

  const updated = store.getTask(task.id);
  assert.equal(updated.status, "dismissed");
  assert.ok(updated.dismissedAt, "dismissedAt should be set");
});

test("updateTask marks task as done", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);
  const task = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.ok(task);

  store.updateTask(task.id, { status: "done" });
  const updated = store.getTask(task.id);
  assert.equal(updated.status, "done");
  assert.ok(updated.completedAt, "completedAt should be set");
});

test("updateTask updates dueAt and notes without changing status", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);
  const task = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.ok(task);

  const newDue = addDays(new Date(), 7).toISOString();
  store.updateTask(task.id, { dueAt: newDue, notes: "Updated notes" });

  const updated = store.getTask(task.id);
  assert.equal(updated.status, "open");
  assert.equal(updated.dueAt, newDue);
  assert.equal(updated.notes, "Updated notes");
});

test("getTask returns null for unknown id", (t) => {
  const store = withTempStore(t);
  const result = store.getTask("nonexistent-id");
  assert.equal(result, null);
});

test("updateTask reassigns caller", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);
  const task = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.ok(task);
  assert.equal(task.callerId, "caller-clotilde");

  store.updateTask(task.id, { assignedCallerId: "caller-florian" });

  const updated = store.getTask(task.id);
  assert.equal(updated.callerId, "caller-florian");
});

test("updateTask throws for unknown assignedCallerId", async (t) => {
  const store = withTempStore(t);
  const { bookingId } = await createTestBooking(store);
  const task = store.ensureFollowUpTask(bookingId, "cancelled");
  assert.ok(task);

  assert.throws(
    () => store.updateTask(task.id, { assignedCallerId: "caller-nonexistent" }),
    /Colleur introuvable/,
  );
});

test("listCallerTasks filters by clientId when provided", (t) => {
  const store = withTempStore(t);
  const allTasks = store.listCallerTasks("caller-clotilde").tasks;
  const filteredTasks = store.listCallerTasks("caller-clotilde", "client-teamstarter").tasks;
  assert.ok(filteredTasks.every((t2) => t2.clientId === "client-teamstarter"));
  assert.ok(allTasks.length >= filteredTasks.length);
});
