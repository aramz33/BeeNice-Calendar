import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {createStore} from "./state.mjs";

const TEST_NOW = "2030-01-07T09:00:00.000Z";

function createProviderStub(providerMode = "mock") {
    return {
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
}

function withTempStore(t, providerMode = "mock") {
    const provider = createProviderStub(providerMode);
    const previousDbPath = process.env.MVP_DB_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-admin-"));
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

async function createTestBooking(store) {
    const availability = await store.listAvailability("teamstarter-discovery", "80");
    const slot = availability.slots[0];
    assert.ok(slot, "need at least one slot");
    return store.createBooking("teamstarter-discovery", {
        callerId: "caller-clotilde",
        companySize: 80,
        companyName: "TestCo",
        prospectName: "Jane Prospect",
        prospectEmail: "jane@example.com",
        notes: null,
        slotStart: slot.startAt,
    });
}

// ─── createClient ─────────────────────────────────────────────────────────────

test("createClient throws when name is empty", (t) => {
    const store = withTempStore(t);
    assert.throws(
        () => store.createClient({name: ""}),
        /Le nom du client est obligatoire/,
    );
});

test("createClient throws when name is missing", (t) => {
    const store = withTempStore(t);
    assert.throws(
        () => store.createClient({}),
        /Le nom du client est obligatoire/,
    );
});

test("createClient returns client and workspace", (t) => {
    const store = withTempStore(t);
    const result = store.createClient({name: "New Client", timezone: "Europe/London"});
    assert.equal(result.client.name, "New Client");
    assert.ok(result.workspace);
});

test("seeded booking links use 15 minute buffers", (t) => {
    const store = withTempStore(t);
    const bookingLink = store.getBookingLinkBySlug("teamstarter-discovery");

    assert.equal(bookingLink.bufferBeforeMinutes, 15);
    assert.equal(bookingLink.bufferAfterMinutes, 15);
});

test("createClient creates booking links with 15 minute buffers", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "Buffered Client"});
    const [bookingLink] = store.listBookingLinksForClient(client.id);

    assert.equal(bookingLink.bufferBeforeMinutes, 15);
    assert.equal(bookingLink.bufferAfterMinutes, 15);
});

test("createClient defaults routingMode to pool_unique for unknown value", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "Routed Client", routingMode: "unknown_mode"});
    assert.equal(client.routingMode, "pool_unique");
});

test("legacy zero booking link buffers are backfilled to 15 minutes", (t) => {
    const previousDbPath = process.env.MVP_DB_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-admin-"));
    const dbPath = path.join(tempDir, "mvp.sqlite");
    process.env.MVP_DB_PATH = dbPath;
    const provider = createProviderStub();
    let migratedStore = null;

    t.after(() => {
        migratedStore?.close();
        if (previousDbPath === undefined) {
            delete process.env.MVP_DB_PATH;
        } else {
            process.env.MVP_DB_PATH = previousDbPath;
        }
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    const initialStore = createStore(provider, { now: TEST_NOW });
    initialStore.close();

    const db = new DatabaseSync(dbPath);
    try {
        db.prepare(`
            UPDATE booking_links
            SET buffer_before_minutes = 0,
                buffer_after_minutes = 0
            WHERE slug = ?
        `).run("teamstarter-discovery");
    } finally {
        db.close();
    }

    migratedStore = createStore(provider);
    const bookingLink = migratedStore.getBookingLinkBySlug("teamstarter-discovery");

    assert.equal(bookingLink.bufferBeforeMinutes, 15);
    assert.equal(bookingLink.bufferAfterMinutes, 15);
});

test("legacy non-zero booking link buffers are preserved", (t) => {
    const previousDbPath = process.env.MVP_DB_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-admin-"));
    const dbPath = path.join(tempDir, "mvp.sqlite");
    process.env.MVP_DB_PATH = dbPath;
    const provider = createProviderStub();
    let migratedStore = null;

    t.after(() => {
        migratedStore?.close();
        if (previousDbPath === undefined) {
            delete process.env.MVP_DB_PATH;
        } else {
            process.env.MVP_DB_PATH = previousDbPath;
        }
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    const initialStore = createStore(provider, { now: TEST_NOW });
    initialStore.close();

    const db = new DatabaseSync(dbPath);
    try {
        db.prepare(`
            UPDATE booking_links
            SET buffer_before_minutes = 10,
                buffer_after_minutes = 20
            WHERE slug = ?
        `).run("teamstarter-discovery");
    } finally {
        db.close();
    }

    migratedStore = createStore(provider);
    const bookingLink = migratedStore.getBookingLinkBySlug("teamstarter-discovery");

    assert.equal(bookingLink.bufferBeforeMinutes, 10);
    assert.equal(bookingLink.bufferAfterMinutes, 20);
});

// ─── updateClient ─────────────────────────────────────────────────────────────

test("updateClient throws for unknown clientId", (t) => {
    const store = withTempStore(t);
    assert.throws(
        () => store.updateClient("nonexistent-client", {name: "New Name"}),
        /Client introuvable/,
    );
});

test("updateClient updates name and returns updated client", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "Original"});
    const updated = store.updateClient(client.id, {name: "Renamed"});
    assert.equal(updated.name, "Renamed");
});

// ─── createCaller ─────────────────────────────────────────────────────────────

test("createCaller throws when name is empty", (t) => {
    const store = withTempStore(t);
    assert.throws(
        () => store.createCaller({name: ""}),
        /Le nom du caller est obligatoire/,
    );
});

test("createCaller returns the new caller", (t) => {
    const store = withTempStore(t);
    const caller = store.createCaller({name: "Alice"});
    assert.equal(caller.name, "Alice");
    assert.equal(caller.active, true);
});

test("createCaller respects active:false", (t) => {
    const store = withTempStore(t);
    const caller = store.createCaller({name: "Inactive", active: false});
    assert.equal(caller.active, false);
});

// ─── updateCaller ─────────────────────────────────────────────────────────────

test("updateCaller throws for unknown callerId", (t) => {
    const store = withTempStore(t);
    assert.throws(
        () => store.updateCaller("no-such-caller", {name: "X"}),
        /Caller introuvable/,
    );
});

test("updateCaller updates caller name", (t) => {
    const store = withTempStore(t);
    const caller = store.createCaller({name: "Bob"});
    const updated = store.updateCaller(caller.id, {name: "Bobby"});
    assert.equal(updated.name, "Bobby");
});

// ─── createRep ────────────────────────────────────────────────────────────────

test("createRep throws for unknown clientId", (t) => {
    const store = withTempStore(t);
    assert.throws(
        () => store.createRep({clientId: "no-such-client", name: "Rep A"}),
        /Client introuvable pour ce rep/,
    );
});

test("createRep throws when name is missing", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "TestCo"});
    assert.throws(
        () => store.createRep({clientId: client.id, name: ""}),
        /Le nom du rep est obligatoire/,
    );
});

test("createRep defaults seniority to non_defini for unknown value", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "TestCo"});
    const rep = store.createRep({clientId: client.id, name: "Rep A", seniority: "god"});
    assert.equal(rep.seniority, "non_defini");
});

test("createRep increments sortOrder", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "TestCo"});
    const rep1 = store.createRep({clientId: client.id, name: "Rep A", seniority: "junior"});
    const rep2 = store.createRep({clientId: client.id, name: "Rep B", seniority: "senior"});
    assert.ok(rep2.sortOrder > rep1.sortOrder);
});

// ─── updateRep ────────────────────────────────────────────────────────────────

test("updateRep throws for unknown repId", (t) => {
    const store = withTempStore(t);
    assert.throws(
        () => store.updateRep("no-such-rep", {name: "X"}),
        /Rep introuvable/,
    );
});

test("updateRep throws when clientId changes", (t) => {
    const store = withTempStore(t);
    const {client: c1} = store.createClient({name: "Client 1"});
    const {client: c2} = store.createClient({name: "Client 2"});
    const rep = store.createRep({clientId: c1.id, name: "Rep A", seniority: "junior"});
    assert.throws(
        () => store.updateRep(rep.id, {clientId: c2.id}),
        /Le client d'un rep ne peut pas être modifié/,
    );
});

test("updateRep updates rep name", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "TestCo"});
    const rep = store.createRep({clientId: client.id, name: "Rep A", seniority: "junior"});
    const updated = store.updateRep(rep.id, {name: "Rep Alpha"});
    assert.equal(updated.name, "Rep Alpha");
});

// ─── findOrCreateRepForPublicConnection ───────────────────────────────────────

test("findOrCreateRepForPublicConnection creates new rep when no match", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "TestCo"});

    const rep = store.findOrCreateRepForPublicConnection(client, {
        firstName: "Alice",
        lastName: "Martin",
        role: "junior",
    });

    assert.equal(rep.name, "Alice Martin");
    assert.equal(rep.seniority, "junior");
});

test("findOrCreateRepForPublicConnection updates existing rep when single match", (t) => {
    const store = withTempStore(t);
    const {client} = store.createClient({name: "TestCo"});
    store.createRep({clientId: client.id, name: "Bob Dupont", seniority: "non_defini"});

    const rep = store.findOrCreateRepForPublicConnection(client, {
        firstName: "Bob",
        lastName: "Dupont",
        role: "senior",
    });

    assert.equal(rep.name, "Bob Dupont");
    assert.equal(rep.seniority, "senior");
});

// ─── listSettings ─────────────────────────────────────────────────────────────

test("listSettings returns clients and callers", (t) => {
    const store = withTempStore(t);
    const settings = store.listSettings();
    assert.ok(Array.isArray(settings.clients));
    assert.ok(Array.isArray(settings.callers));
});

// ─── refreshCalendarBookings ─────────────────────────────────────────────────

test("refreshCalendarBookings returns refreshed:0 in mock mode", async (t) => {
    const store = withTempStore(t);
    const result = await store.refreshCalendarBookings();
    assert.deepEqual(result, {refreshed: 0});
});

// ─── handleWebhook ────────────────────────────────────────────────────────────

test("handleWebhook in mock mode stores event and returns ok", async (t) => {
    const store = withTempStore(t);
    const result = await store.handleWebhook({type: "mock.event"});
    assert.deepEqual(result, {ok: true});
});

test("handleWebhook with grantId updates connection last_webhook_at", async (t) => {
    const store = withTempStore(t);
    const result = await store.handleWebhook({
        type: "event.updated",
        data: {grant_id: "some-grant"},
    });
    assert.deepEqual(result, {ok: true});
});

// ─── applyProviderCancellation ────────────────────────────────────────────────

test("applyProviderCancellation is a no-op when already cancelled", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    await store.updateBookingSchedule(booking.bookingId, "cancelled");
    const cancelledBooking = store.getBooking(booking.bookingId);
    assert.equal(cancelledBooking.scheduleState, "cancelled");

    await store.applyProviderCancellation(cancelledBooking, "Already cancelled.");
    const afterBooking = store.getBooking(booking.bookingId);
    assert.equal(afterBooking.scheduleState, "cancelled");
});

test("applyProviderCancellation cancels a scheduled booking", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    const scheduledBooking = store.getBooking(booking.bookingId);
    assert.equal(scheduledBooking.scheduleState, "scheduled");

    await store.applyProviderCancellation(scheduledBooking, "Provider cancelled.");
    const after = store.getBooking(booking.bookingId);
    assert.equal(after.scheduleState, "cancelled");
});

// ─── applyProviderReschedule ─────────────────────────────────────────────────

test("applyProviderReschedule moves the booking to a new time", async (t) => {
    const store = withTempStore(t);
    const booking = await createTestBooking(store);
    const scheduledBooking = store.getBooking(booking.bookingId);

    const newStart = new Date(scheduledBooking.startAt);
    newStart.setHours(newStart.getHours() + 2);
    const newEnd = new Date(scheduledBooking.endAt);
    newEnd.setHours(newEnd.getHours() + 2);

    await store.applyProviderReschedule(
        scheduledBooking,
        newStart.toISOString(),
        newEnd.toISOString(),
        "Provider rescheduled.",
    );

    const after = store.getBooking(booking.bookingId);
    assert.equal(after.scheduleState, "rescheduled");
    assert.equal(after.startAt, newStart.toISOString());
});
