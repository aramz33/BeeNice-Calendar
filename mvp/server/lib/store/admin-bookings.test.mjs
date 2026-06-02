import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseISO, subDays, addDays } from "date-fns";
import {
  filterBookings,
  filterTasks,
  getCallerCancelMode,
  getClientStats,
  toBookingSummary,
  listAdminCalendar,
  listAdminTasks,
} from "./admin-bookings.mjs";
import { createStore } from "../state.mjs";

// ─── helpers ────────────────────────────────────────────────────────────────

function withTempStore(t, provider = createProviderStub()) {
  const previousDbPath = process.env.MVP_DB_PATH;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-admin-"));
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
    getOverview() {
      return { providerMode: mode, nylasConfigured: mode !== "nylas" };
    },
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

function makeBooking(overrides = {}) {
  return {
    id: "bk-1",
    scheduleState: "scheduled",
    outcomeState: "pending",
    clientId: "client-1",
    callerId: "caller-1",
    assignedRepId: "rep-1",
    companyName: "ACME",
    companySize: 100,
    prospectName: "Jane",
    prospectEmail: "jane@example.com",
    startAt: addDays(new Date(), 2).toISOString(),
    endAt: addDays(new Date(), 2).toISOString(),
    originalStartAt: null,
    previousStartAt: null,
    timezone: "Europe/Paris",
    notes: null,
    externalEventId: null,
    assignmentReason: {},
    ...overrides,
  };
}

function makeStoreMock(overrides = {}) {
  return {
    getClient: (id) => ({ id, name: `Client-${id}` }),
    getCaller: (id) => ({ id, name: `Caller-${id}` }),
    getRep: (id) => ({ id, name: `Rep-${id}` }),
    getDisplayStatus: (b) => b.scheduleState === "cancelled" ? "cancelled" : "scheduled",
    getOpenTaskByBookingId: () => null,
    getTaskByReplacement: () => null,
    getConnection: () => null,
    ...overrides,
  };
}

// ─── filterBookings ──────────────────────────────────────────────────────────

test("filterBookings returns all bookings with no filters", () => {
  const store = makeStoreMock();
  const bookings = [makeBooking({ id: "b1" }), makeBooking({ id: "b2" })];
  const result = filterBookings(store, bookings, {});
  assert.equal(result.length, 2);
});

test("filterBookings filters by callerId", () => {
  const store = makeStoreMock();
  const bookings = [
    makeBooking({ id: "b1", callerId: "c1" }),
    makeBooking({ id: "b2", callerId: "c2" }),
  ];
  const result = filterBookings(store, bookings, { callerId: "c1" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b1");
});

test("filterBookings skips callerId filter when value is 'all'", () => {
  const store = makeStoreMock();
  const bookings = [makeBooking({ id: "b1", callerId: "c1" }), makeBooking({ id: "b2", callerId: "c2" })];
  const result = filterBookings(store, bookings, { callerId: "all" });
  assert.equal(result.length, 2);
});

test("filterBookings filters by repId", () => {
  const store = makeStoreMock();
  const bookings = [
    makeBooking({ id: "b1", assignedRepId: "r1" }),
    makeBooking({ id: "b2", assignedRepId: "r2" }),
  ];
  const result = filterBookings(store, bookings, { repId: "r2" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b2");
});

test("filterBookings filters by clientId", () => {
  const store = makeStoreMock();
  const bookings = [
    makeBooking({ id: "b1", clientId: "cl1" }),
    makeBooking({ id: "b2", clientId: "cl2" }),
  ];
  const result = filterBookings(store, bookings, { clientId: "cl1" });
  assert.equal(result.length, 1);
});

test("filterBookings filters by status", () => {
  const store = makeStoreMock({
    getDisplayStatus: (b) => b.scheduleState,
  });
  const bookings = [
    makeBooking({ id: "b1", scheduleState: "scheduled" }),
    makeBooking({ id: "b2", scheduleState: "cancelled" }),
  ];
  const result = filterBookings(store, bookings, { status: "cancelled" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b2");
});

test("filterBookings filters by from date", () => {
  const store = makeStoreMock();
  const future = addDays(new Date(), 5).toISOString();
  const past = subDays(new Date(), 1).toISOString();
  const bookings = [
    makeBooking({ id: "b1", startAt: future }),
    makeBooking({ id: "b2", startAt: past }),
  ];
  const from = new Date().toISOString();
  const result = filterBookings(store, bookings, { from });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b1");
});

test("filterBookings filters by to date", () => {
  const store = makeStoreMock();
  const near = addDays(new Date(), 1).toISOString();
  const far = addDays(new Date(), 30).toISOString();
  const to = addDays(new Date(), 5).toISOString();
  const bookings = [
    makeBooking({ id: "b1", startAt: near }),
    makeBooking({ id: "b2", startAt: far }),
  ];
  const result = filterBookings(store, bookings, { to });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b1");
});

test("filterBookings filters by query matching prospectName", () => {
  const store = makeStoreMock();
  const bookings = [
    makeBooking({ id: "b1", prospectName: "Alice Dupont" }),
    makeBooking({ id: "b2", prospectName: "Bob Martin" }),
  ];
  const result = filterBookings(store, bookings, { query: "alice" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b1");
});

test("filterBookings filters by query matching companyName", () => {
  const store = makeStoreMock();
  const bookings = [
    makeBooking({ id: "b1", companyName: "TechCorp" }),
    makeBooking({ id: "b2", companyName: "AgroFarm" }),
  ];
  const result = filterBookings(store, bookings, { query: "techcorp" });
  assert.equal(result.length, 1);
});

// ─── filterTasks ─────────────────────────────────────────────────────────────

test("filterTasks returns all tasks with no filters", () => {
  const tasks = [
    { id: "t1", callerId: "c1", clientId: "cl1", status: "open", companyName: "A", clientName: "C", callerName: "U", prospectName: "P" },
    { id: "t2", callerId: "c2", clientId: "cl2", status: "open", companyName: "B", clientName: "D", callerName: "V", prospectName: "Q" },
  ];
  const result = filterTasks(tasks, {});
  assert.equal(result.length, 2);
});

test("filterTasks filters by callerId", () => {
  const tasks = [
    { id: "t1", callerId: "c1", clientId: "cl1", status: "open", companyName: "A", clientName: "C", callerName: "U", prospectName: "P" },
    { id: "t2", callerId: "c2", clientId: "cl1", status: "open", companyName: "B", clientName: "C", callerName: "V", prospectName: "Q" },
  ];
  const result = filterTasks(tasks, { callerId: "c1" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "t1");
});

test("filterTasks filters by clientId", () => {
  const tasks = [
    { id: "t1", callerId: "c1", clientId: "cl1", status: "open", companyName: "A", clientName: "ClientA", callerName: "U", prospectName: "P" },
    { id: "t2", callerId: "c1", clientId: "cl2", status: "open", companyName: "B", clientName: "ClientB", callerName: "U", prospectName: "Q" },
  ];
  const result = filterTasks(tasks, { clientId: "cl2" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "t2");
});

test("filterTasks skips callerId filter when value is 'all'", () => {
  const tasks = [
    { id: "t1", callerId: "c1", clientId: "cl1", status: "open", companyName: "A", clientName: "C", callerName: "U", prospectName: "P" },
  ];
  const result = filterTasks(tasks, { callerId: "all" });
  assert.equal(result.length, 1);
});

test("filterTasks filters by query matching clientName", () => {
  const tasks = [
    { id: "t1", callerId: "c1", clientId: "cl1", status: "open", companyName: "A", clientName: "TeamStarter", callerName: "U", prospectName: "P" },
    { id: "t2", callerId: "c1", clientId: "cl2", status: "open", companyName: "B", clientName: "Doctolib", callerName: "U", prospectName: "Q" },
  ];
  const result = filterTasks(tasks, { query: "teamstarter" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "t1");
});

// ─── getCallerCancelMode ──────────────────────────────────────────────────────

const activeStates = new Set(["scheduled", "rescheduled"]);

test("getCallerCancelMode returns null for non-active scheduleState", () => {
  const store = makeStoreMock();
  const booking = makeBooking({ scheduleState: "cancelled" });
  assert.equal(getCallerCancelMode(store, booking, activeStates, "mock"), null);
});

test("getCallerCancelMode returns null for non-pending outcomeState", () => {
  const store = makeStoreMock();
  const booking = makeBooking({ outcomeState: "completed" });
  assert.equal(getCallerCancelMode(store, booking, activeStates, "mock"), null);
});

test("getCallerCancelMode returns null when booking is in the past", () => {
  const store = makeStoreMock();
  const booking = makeBooking({ startAt: subDays(new Date(), 1).toISOString() });
  assert.equal(getCallerCancelMode(store, booking, activeStates, "mock"), null);
});

test("getCallerCancelMode returns 'direct' in mock mode", () => {
  const store = makeStoreMock();
  const booking = makeBooking({ startAt: addDays(new Date(), 2).toISOString() });
  assert.equal(getCallerCancelMode(store, booking, activeStates, "mock"), "direct");
});

test("getCallerCancelMode returns 'admin_only' in nylas mode when rep not connected", () => {
  const store = makeStoreMock({ getConnection: () => null });
  const booking = makeBooking({ startAt: addDays(new Date(), 2).toISOString() });
  assert.equal(getCallerCancelMode(store, booking, activeStates, "nylas"), "admin_only");
});

test("getCallerCancelMode returns 'direct' in nylas mode when rep is connected", () => {
  const store = makeStoreMock({ getConnection: () => ({ status: "connected" }) });
  const booking = makeBooking({ startAt: addDays(new Date(), 2).toISOString() });
  assert.equal(getCallerCancelMode(store, booking, activeStates, "nylas"), "direct");
});

test("getCallerCancelMode returns 'admin_only' in nylas mode when connection not connected", () => {
  const store = makeStoreMock({ getConnection: () => ({ status: "auth_required" }) });
  const booking = makeBooking({ startAt: addDays(new Date(), 2).toISOString() });
  assert.equal(getCallerCancelMode(store, booking, activeStates, "nylas"), "admin_only");
});

// ─── getClientStats ───────────────────────────────────────────────────────────

test("getClientStats returns empty array for no bookings or tasks", () => {
  const store = makeStoreMock();
  assert.deepEqual(getClientStats(store, [], []), []);
});

test("getClientStats computes total and byStatus from bookings", () => {
  const store = makeStoreMock({
    getDisplayStatus: (b) => b.scheduleState,
  });
  const bookings = [
    makeBooking({ clientId: "cl1", scheduleState: "scheduled" }),
    makeBooking({ clientId: "cl1", scheduleState: "completed" }),
    makeBooking({ clientId: "cl1", scheduleState: "no_show" }),
  ];
  const [stat] = getClientStats(store, bookings, []);
  assert.equal(stat.clientId, "cl1");
  assert.equal(stat.total, 3);
  assert.equal(stat.byStatus.scheduled, 1);
  assert.equal(stat.byStatus.completed, 1);
  assert.equal(stat.byStatus.no_show, 1);
  assert.equal(stat.completedPct, 33);
  assert.equal(stat.noShowPct, 33);
});

test("getClientStats shows completedPct 0 when no bookings", () => {
  const store = makeStoreMock();
  const tasks = [{ clientId: "cl1", status: "open" }];
  const [stat] = getClientStats(store, [], tasks);
  assert.equal(stat.total, 0);
  assert.equal(stat.completedPct, 0);
  assert.equal(stat.openTaskCount, 1);
});

test("getClientStats counts open tasks per client", () => {
  const store = makeStoreMock({ getDisplayStatus: (b) => b.scheduleState });
  const bookings = [makeBooking({ clientId: "cl1" })];
  const tasks = [
    { clientId: "cl1", status: "open" },
    { clientId: "cl1", status: "open" },
    { clientId: "cl1", status: "done" },
  ];
  const [stat] = getClientStats(store, bookings, tasks);
  assert.equal(stat.openTaskCount, 2);
});

// ─── Integration: listAdminCalendar, listAdminTasks ───────────────────────────

test("listAdminCalendar returns entries within default date range", (t) => {
  const store = withTempStore(t, createProviderStub());
  const result = store.listAdminCalendar({});
  assert.ok(result.timezone);
  assert.ok(Array.isArray(result.entries));
  assert.ok(result.from);
  assert.ok(result.to);
});

test("listAdminCalendar respects from/to filters", (t) => {
  const store = withTempStore(t, createProviderStub());
  const from = subDays(new Date(), 30).toISOString();
  const to = subDays(new Date(), 29).toISOString();
  const result = store.listAdminCalendar({ from, to });
  assert.equal(result.entries.length, 0);
});

test("listAdminTasks returns task list", (t) => {
  const store = withTempStore(t, createProviderStub());
  const result = store.listAdminTasks({});
  assert.ok(result.timezone);
  assert.ok(Array.isArray(result.tasks));
});

test("listAdminTasks filters by callerId", (t) => {
  const store = withTempStore(t, createProviderStub());
  const all = store.listAdminTasks({});
  const filtered = store.listAdminTasks({ callerId: "caller-clotilde" });
  assert.ok(filtered.tasks.every((task) => task.callerId === "caller-clotilde"));
  assert.ok(all.tasks.length >= filtered.tasks.length);
});
