import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createStore} from "./state.mjs";

const TEST_NOW = "2030-01-07T09:00:00.000Z";

function withTempStore(t, providerMode = "mock") {
    const provider = {
        mode: providerMode,
        getOverview() {
            return {providerMode, nylasConfigured: false};
        },
        async startRepConnection(_store, repId) {
            return {repId, connection: {status: "auth_required"}};
        },
        async finalizeRepConnection() {
            return {repId: null, affectedClientIds: []};
        },
        async listBusyIntervals() {
            return [];
        },
        async createExternalEvent(_s, _r, booking) {
            return `evt-${booking.id}`;
        },
        async fetchExternalEvent(_s, booking) {
            return {id: booking.externalEventId, startAt: new Date(booking.startAt), endAt: new Date(booking.endAt)};
        },
        async releaseExternalEvent() {
        },
    };

    const previousDbPath = process.env.MVP_DB_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-bval-"));
    process.env.MVP_DB_PATH = path.join(tempDir, "mvp.sqlite");
    const store = createStore(provider, { now: TEST_NOW });

    t.after(() => {
        store.close();
        if (previousDbPath === undefined) {
            delete process.env.MVP_DB_PATH;
        } else {
            process.env.MVP_DB_PATH = previousDbPath;
        }
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    return store;
}

async function createTestBooking(store, overrides = {}) {
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];
    assert.ok(slot, "need at least one available slot");
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

// ─── createBooking validation ─────────────────────────────────────────────────

test("createBooking throws for unknown booking link slug", async (t) => {
    const store = withTempStore(t);
    await assert.rejects(
        () => store.createBooking("no-such-slug", {
            callerId: "caller-clotilde",
            companySize: 80,
            companyName: "TestCo",
            prospectName: "Jane",
            prospectEmail: "jane@example.com",
            slotStart: new Date().toISOString(),
        }),
        /Booking link introuvable/,
    );
});

test("createBooking throws for inactive caller", async (t) => {
    const store = withTempStore(t);
    const caller = store.createCaller({name: "Inactive Caller", active: false});
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];

    await assert.rejects(
        () => store.createBooking("teamstarter-discovery", {
            callerId: caller.id,
            companySize: 80,
            companyName: "TestCo",
            prospectName: "Jane",
            prospectEmail: "jane@example.com",
            slotStart: slot.startAt,
        }),
        /Caller introuvable/,
    );
});

test("createBooking throws for unknown callerId", async (t) => {
    const store = withTempStore(t);
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];

    await assert.rejects(
        () => store.createBooking("teamstarter-discovery", {
            callerId: "caller-nonexistent",
            companySize: 80,
            companyName: "TestCo",
            prospectName: "Jane",
            prospectEmail: "jane@example.com",
            slotStart: slot.startAt,
        }),
        /Caller introuvable/,
    );
});

test("createBooking throws when required fields are missing", async (t) => {
    const store = withTempStore(t);
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];

    await assert.rejects(
        () => store.createBooking("teamstarter-discovery", {
            callerId: "caller-clotilde",
            companySize: 80,
            companyName: "TestCo",
            prospectEmail: "jane@example.com",
            slotStart: slot.startAt,
        }),
        /Informations booking incomplètes/,
    );
});

test("createBooking throws for invalid slotStart date string", async (t) => {
    const store = withTempStore(t);
    await assert.rejects(
        () => store.createBooking("teamstarter-discovery", {
            callerId: "caller-clotilde",
            companySize: 80,
            companyName: "TestCo",
            prospectName: "Jane",
            prospectEmail: "jane@example.com",
            slotStart: "not-a-date",
        }),
        /Créneau invalide/,
    );
});

test("createBooking throws when sourceTask belongs to a different caller", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await store.updateBookingSchedule(booking.bookingId, "cancelled");
    const task = store.getOpenTaskByBookingId(booking.bookingId);

    const otherCaller = store.createCaller({name: "Other Caller"});
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];
    assert.ok(slot, "need a slot");
    assert.ok(task, "need a follow-up task after cancel");

    await assert.rejects(
        () => store.createBooking("teamstarter-discovery", {
            callerId: otherCaller.id,
            companySize: 80,
            companyName: "OtherCo",
            prospectName: "Bob",
            prospectEmail: "bob@example.com",
            slotStart: slot.startAt,
            sourceTaskId: task.id,
        }),
        /tâche ne correspond pas au caller/,
    );
});

// ─── updateBookingOutcome ─────────────────────────────────────────────────────

test("updateBookingOutcome throws for invalid outcome state", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await assert.rejects(
        () => store.updateBookingOutcome(booking.bookingId, "invalid_outcome"),
        /Outcome invalide/,
    );
});

test("updateBookingOutcome throws for unknown booking", async (t) => {
    const store = withTempStore(t);
    await assert.rejects(
        () => store.updateBookingOutcome("no-such-booking", "completed"),
        /Booking introuvable/,
    );
});

test("updateBookingOutcome throws when outcome is already set", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await store.updateBookingOutcome(booking.bookingId, "completed");
    await assert.rejects(
        () => store.updateBookingOutcome(booking.bookingId, "completed"),
        /Le booking a déjà ce résultat/,
    );
});

test("updateBookingOutcome sets outcome to completed", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    const result = await store.updateBookingOutcome(booking.bookingId, "completed");
    assert.deepEqual(result, {ok: true});
    const updated = store.getBooking(booking.bookingId);
    assert.equal(updated.outcomeState, "completed");
});

test("updateBookingOutcome sets outcome to no_show and creates follow-up task", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await store.updateBookingOutcome(booking.bookingId, "no_show");
    const task = store.getOpenTaskByBookingId(booking.bookingId);
    assert.ok(task, "follow-up task should be created for no_show");
});

test("updateBookingOutcome sets outcome to not_qualified", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await store.updateBookingOutcome(booking.bookingId, "not_qualified");
    const updated = store.getBooking(booking.bookingId);
    assert.equal(updated.outcomeState, "not_qualified");
});

// ─── updateBookingSchedule ────────────────────────────────────────────────────

test("updateBookingSchedule throws for invalid scheduleState", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await assert.rejects(
        () => store.updateBookingSchedule(booking.bookingId, "invalid_state"),
        /Statut calendrier invalide/,
    );
});

test("updateBookingSchedule throws for unknown booking", async (t) => {
    const store = withTempStore(t);
    await assert.rejects(
        () => store.updateBookingSchedule("no-such-booking", "cancelled"),
        /Booking introuvable/,
    );
});

test("updateBookingSchedule cancels a booking", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    const result = await store.updateBookingSchedule(booking.bookingId, "cancelled", "Test cancel");
    assert.deepEqual(result, {ok: true});
    const updated = store.getBooking(booking.bookingId);
    assert.equal(updated.scheduleState, "cancelled");
});

test("updateBookingSchedule throws for rescheduled without nextStartAt", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await assert.rejects(
        () => store.updateBookingSchedule(booking.bookingId, "rescheduled"),
        /Nouvelle date obligatoire/,
    );
});

test("updateBookingSchedule throws for rescheduled with invalid nextStartAt", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await assert.rejects(
        () => store.updateBookingSchedule(booking.bookingId, "rescheduled", "", "not-a-date"),
        /Nouvelle date invalide/,
    );
});

test("updateBookingSchedule reschedules a booking to a new slot", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    const originalBooking = store.getBooking(booking.bookingId);

    const availability = await store.listBookingRescheduleAvailability(booking.bookingId);
    const newSlot = availability.slots.find((s) => s.startAt !== originalBooking.startAt);
    assert.ok(newSlot, "need an alternative slot");

    const result = await store.updateBookingSchedule(
        booking.bookingId,
        "rescheduled",
        "Client request",
        newSlot.startAt,
    );
    assert.deepEqual(result, {ok: true});
    const updated = store.getBooking(booking.bookingId);
    assert.equal(updated.scheduleState, "rescheduled");
    assert.equal(updated.startAt, newSlot.startAt);
});
