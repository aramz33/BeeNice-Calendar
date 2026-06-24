import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {addMinutes, endOfWeek, parseISO, startOfWeek} from "date-fns";
import {createStore} from "./state.mjs";

const TEST_NOW = "2030-01-07T09:00:00.000Z";

function withTempStore(t, provider = createProviderStub()) {
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
        fs.rmSync(tempDir, {recursive: true, force: true});
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
        async releaseExternalEvent() {
        },
    };
}

function withDb(store, task) {
    const db = new DatabaseSync(store.dbFile);
    try {
        return task(db);
    } finally {
        db.close();
    }
}

function blockReps(store, reps, startAt, endAt) {
    withDb(store, (db) => {
        const insert = db.prepare(`
      INSERT INTO calendar_events (id, title, rep_id, start_at, end_at, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

        reps.forEach((rep) => {
            insert.run(
                `calendar-event-${randomUUID()}`,
                "Busy in availability test",
                rep.id,
                startAt,
                endAt,
                "test",
            );
        });
    });
}

async function bookFirstAvailableSlot(store, overrides = {}) {
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];
    assert.ok(slot, "expected at least one seeded slot");

    return store.createBooking("teamstarter-discovery", {
        callerId: "caller-clotilde",
        companySize: 80,
        companyName: "ACME",
        prospectName: "Jane Doe",
        prospectEmail: "jane@example.com",
        notes: "Booking created in availability test.",
        slotStart: slot.startAt,
        ...overrides,
    });
}

test("assignRepForSlot routes by percentage across all connected reps", async (t) => {
    const store = withTempStore(t);
    const bookingLink = store.getBookingLinkBySlug("teamstarter-discovery");
    const availability = await store.listAvailability("teamstarter-discovery", "320");
    const slot = availability.slots[0];

    assert.ok(bookingLink);
    assert.ok(slot, "expected at least one slot");
    assert.equal(slot.seniorityPool, "all", "company size no longer narrows the pool");

    const assignment = await store.assignRepForSlot(
        bookingLink,
        320,
        parseISO(slot.startAt),
    );

    assert.equal(assignment.reason.routingMode, "percentage");
    assert.ok(assignment.reason.candidateRepIds.includes(assignment.rep.id));
    assert.ok(
        assignment.reason.effectiveWeights[assignment.rep.id] >= 0,
        "chosen rep carries an effective weight",
    );
});

test("assignRepForSlot rejects a displayed slot after every eligible rep becomes busy", async (t) => {
    const store = withTempStore(t);
    const bookingLink = store.getBookingLinkBySlug("teamstarter-discovery");
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];

    assert.ok(bookingLink);
    assert.ok(slot, "expected a slot to become stale");

    blockReps(
        store,
        store.getRepsForLink(bookingLink.id),
        slot.startAt,
        slot.endAt,
    );

    await assert.rejects(
        () => store.assignRepForSlot(bookingLink, 80, parseISO(slot.startAt)),
        /Le créneau sélectionné n'est plus disponible/,
    );
});

test("reschedule availability excludes the booking being moved", async (t) => {
    const store = withTempStore(t);
    const result = await bookFirstAvailableSlot(store);
    const booking = store.getBooking(result.bookingId);
    const bookingLink = store.getBookingLinkById(booking.bookingLinkId);
    const otherReps = store
        .getRepsForLink(bookingLink.id)
        .filter((rep) => rep.id !== booking.assignedRepId);

    blockReps(store, otherReps, booking.startAt, booking.endAt);

    const weekStart = startOfWeek(parseISO(booking.startAt), {weekStartsOn: 1});
    const availability = await store.buildAvailability(
        bookingLink,
        booking.companySize,
        {
            from: weekStart.toISOString(),
            to: endOfWeek(weekStart, {weekStartsOn: 1}).toISOString(),
        },
        {
            excludedBookingId: booking.id,
            includeRepDetails: true,
        },
    );
    const currentSlot = availability.slots.find((slot) => slot.startAt === booking.startAt);

    assert.ok(currentSlot, "expected the current booking slot to remain available");
    assert.deepEqual(currentSlot.availableRepIds, [booking.assignedRepId]);
});

test("existing bookings block slots without 15 minutes free before and after", async (t) => {
    const store = withTempStore(t);
    const {client, workspace} = store.createClient({
        name: "Buffer Client",
        primaryContactFirstName: "Marie",
        primaryContactLastName: "Martin",
        primaryContactPhone: "+33611223344",
        primaryContactEmail: "marie.martin@example.com",
    });
    const rep = store.createRep({
        clientId: client.id,
        name: "Solo Rep",
    });
    store.upsertConnection(rep.id, {
        provider: "mock",
        providerEmail: "solo@example.com",
        status: "connected",
    });

    let bookingLink = store.getBookingLinkBySlug(workspace.slug);
    withDb(store, (db) => {
        db.prepare("UPDATE booking_links SET interval_minutes = 15 WHERE id = ?")
            .run(bookingLink.id);
    });
    bookingLink = store.getBookingLinkBySlug(workspace.slug);

    const availability = await store.listAvailability(workspace.slug, "80");
    const bookingSlot = availability.slots.find((slot) => {
        const start = parseISO(slot.startAt);
        return start.getHours() === 10 && start.getMinutes() === 0;
    });
    assert.ok(bookingSlot, "expected a 10:00 slot");

    await store.createBooking(workspace.slug, {
        callerId: "caller-clotilde",
        companySize: 80,
        companyName: "ACME",
        prospectName: "Jane Doe",
        prospectEmail: "jane@example.com",
        notes: "Buffered booking.",
        slotStart: bookingSlot.startAt,
    });

    const bookingStart = parseISO(bookingSlot.startAt);
    const weekStart = startOfWeek(bookingStart, {weekStartsOn: 1});
    const updatedAvailability = await store.buildAvailability(
        bookingLink,
        80,
        {
            from: weekStart.toISOString(),
            to: endOfWeek(weekStart, {weekStartsOn: 1}).toISOString(),
        },
    );
    const availableStarts = new Set(
        updatedAvailability.slots.map((slot) => slot.startAt),
    );

    assert.equal(availableStarts.has(addMinutes(bookingStart, -30).toISOString()), false);
    assert.equal(availableStarts.has(addMinutes(bookingStart, 30).toISOString()), false);
    assert.equal(availableStarts.has(addMinutes(bookingStart, 45).toISOString()), false);
    assert.equal(availableStarts.has(addMinutes(bookingStart, 60).toISOString()), true);
});

test("booking creation reports the current unavailable-slot error when assignment cannot be made", async (t) => {
    const store = withTempStore(t);
    const bookingLink = store.getBookingLinkBySlug("teamstarter-discovery");
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];

    assert.ok(bookingLink);
    assert.ok(slot, "expected a slot to block");

    blockReps(
        store,
        store.getRepsForLink(bookingLink.id),
        slot.startAt,
        slot.endAt,
    );

    await assert.rejects(
        () =>
            store.createBooking("teamstarter-discovery", {
                callerId: "caller-clotilde",
                companySize: 80,
                companyName: "ACME",
                prospectName: "Jane Doe",
                prospectEmail: "jane@example.com",
                notes: "Unavailable slot test.",
                slotStart: slot.startAt,
            }),
        /Le créneau sélectionné n'est plus disponible/,
    );
});
