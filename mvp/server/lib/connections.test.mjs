import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createStore} from "./state.mjs";
import {
    disconnectConnection,
    findConflictingConnections,
    getEffectiveConnectionStatus,
    getPublicRepConnectionPayload,
    isConnectionUsable,
    startPublicRepConnection,
} from "./connections.mjs";

const CLIENT_CONTACT = {
    primaryContactFirstName: "Marie",
    primaryContactLastName: "Martin",
    primaryContactPhone: "+33611223344",
    primaryContactEmail: "marie.martin@example.com",
};

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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-conn-"));
    process.env.MVP_DB_PATH = path.join(tempDir, "mvp.sqlite");
    const store = createStore(provider);

    t.after(() => {
        store.close();
        if (previousDbPath === undefined) {
            delete process.env.MVP_DB_PATH;
        } else {
            process.env.MVP_DB_PATH = previousDbPath;
        }
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    return {store, provider};
}

// ─── isConnectionUsable ───────────────────────────────────────────────────────

test("isConnectionUsable returns false for null connection", () => {
    assert.equal(isConnectionUsable(null, "mock"), false);
});

test("isConnectionUsable returns false when status is not connected", () => {
    assert.equal(isConnectionUsable({status: "disconnected", provider: "mock"}, "mock"), false);
});

test("isConnectionUsable returns true for mock connection in mock mode", () => {
    assert.equal(isConnectionUsable({status: "connected", provider: "mock"}, "mock"), true);
});

test("isConnectionUsable returns false for mock connection in nylas mode", () => {
    assert.equal(isConnectionUsable({status: "connected", provider: "mock"}, "nylas"), false);
});

test("isConnectionUsable returns true for nylas connection with grantId in nylas mode", () => {
    assert.equal(
        isConnectionUsable({status: "connected", provider: "nylas", providerGrantId: "grant-123"}, "nylas"),
        true,
    );
});

test("isConnectionUsable returns false for nylas connection without grantId in nylas mode", () => {
    assert.equal(
        isConnectionUsable({status: "connected", provider: "nylas", providerGrantId: null}, "nylas"),
        false,
    );
});

// ─── getEffectiveConnectionStatus ────────────────────────────────────────────

test("getEffectiveConnectionStatus returns disconnected for null", () => {
    assert.equal(getEffectiveConnectionStatus(null, "mock"), "disconnected");
});

test("getEffectiveConnectionStatus returns auth_required when status is not connected", () => {
    assert.equal(
        getEffectiveConnectionStatus({status: "auth_required", provider: "mock"}, "mock"),
        "auth_required",
    );
});

test("getEffectiveConnectionStatus returns connected for usable mock connection", () => {
    assert.equal(
        getEffectiveConnectionStatus({status: "connected", provider: "mock"}, "mock"),
        "connected",
    );
});

test("getEffectiveConnectionStatus returns disconnected for connected but unusable nylas connection", () => {
    assert.equal(
        getEffectiveConnectionStatus({status: "connected", provider: "nylas", providerGrantId: null}, "nylas"),
        "disconnected",
    );
});

// ─── findConflictingConnections ───────────────────────────────────────────────

test("findConflictingConnections returns empty array when both identity fields are null", (t) => {
    const {store} = withTempStore(t);
    const db = store._db ?? null;

    const result = findConflictingConnections(
        {prepare: (sql) => ({all: () => []})},
        {providerGrantId: null, providerAccountId: null},
    );
    assert.deepEqual(result, []);
});

// ─── disconnectConnection ─────────────────────────────────────────────────────

test("disconnectConnection returns null when rep has no connection", (t) => {
    const {store, provider} = withTempStore(t);
    const client = store.createClient({name: "TestCo", ...CLIENT_CONTACT}).client;
    const rep = store.createRep({clientId: client.id, name: "Rep A", seniority: "junior"});

    const result = disconnectConnection(
        {prepare: () => ({get: () => null})},
        provider,
        rep.id,
    );
    assert.equal(result, null);
});

// ─── getPublicRepConnectionPayload ────────────────────────────────────────────

test("getPublicRepConnectionPayload throws for unknown invite token", (t) => {
    const {store} = withTempStore(t);
    assert.throws(
        () => getPublicRepConnectionPayload(store, "invalid-token"),
        /Lien de connexion introuvable/,
    );
});

test("getPublicRepConnectionPayload returns client and fields for valid token", (t) => {
    const {store} = withTempStore(t);
    const {client} = store.createClient({name: "TestCo", timezone: "Europe/Paris", ...CLIENT_CONTACT});

    const payload = getPublicRepConnectionPayload(store, client.connectionInviteToken);

    assert.equal(payload.client.id, client.id);
    assert.equal(payload.client.name, "TestCo");
    assert.ok(Array.isArray(payload.fields));
    const fieldIds = payload.fields.map((f) => f.id);
    assert.ok(fieldIds.includes("firstName"));
    assert.ok(fieldIds.includes("lastName"));
    assert.ok(fieldIds.includes("provider"));
    assert.ok(fieldIds.includes("role"));
});

test("getPublicRepConnectionPayload includes custom select field from repConnectionFormConfig", (t) => {
    const {store} = withTempStore(t);
    const {client} = store.createClient({
        name: "TestCo",
        ...CLIENT_CONTACT,
        repConnectionFormConfig: [
            {
                id: "territory",
                label: "Territoire",
                type: "select",
                required: true,
                options: [
                    {id: "north", label: "Nord"},
                    {id: "south", label: "Sud"},
                ],
            },
        ],
    });

    const payload = getPublicRepConnectionPayload(store, client.connectionInviteToken);
    const customField = payload.fields.find((f) => f.id === "territory");
    assert.ok(customField, "custom field should be included");
    assert.equal(customField.type, "select");
    assert.equal(customField.options.length, 2);
});

test("getPublicRepConnectionPayload strips reserved field ids from custom config", (t) => {
    const {store} = withTempStore(t);
    const {client} = store.createClient({
        name: "TestCo",
        ...CLIENT_CONTACT,
        repConnectionFormConfig: [
            {id: "firstName", label: "Prénom overridden", type: "text", required: true},
            {id: "customField", label: "Custom", type: "text", required: false},
        ],
    });

    const payload = getPublicRepConnectionPayload(store, client.connectionInviteToken);
    const fieldIds = payload.fields.map((f) => f.id);
    assert.equal(fieldIds.filter((id) => id === "firstName").length, 1, "firstName should appear only once");
    assert.ok(fieldIds.includes("customField"));
});

// ─── startPublicRepConnection ─────────────────────────────────────────────────

test("startPublicRepConnection throws for unknown invite token", async (t) => {
    const {store} = withTempStore(t);
    await assert.rejects(
        () => startPublicRepConnection(store, "bad-token", {}),
        /Lien de connexion introuvable/,
    );
});

test("startPublicRepConnection throws for invalid provider", async (t) => {
    const {store} = withTempStore(t);
    const {client} = store.createClient({name: "TestCo", ...CLIENT_CONTACT});

    await assert.rejects(
        () => startPublicRepConnection(store, client.connectionInviteToken, {
            provider: "zoom",
            firstName: "Alice",
            lastName: "Martin",
            role: "junior",
        }),
        /Provider de connexion invalide/,
    );
});

test("startPublicRepConnection throws when firstName or lastName is missing", async (t) => {
    const {store} = withTempStore(t);
    const {client} = store.createClient({name: "TestCo", ...CLIENT_CONTACT});

    await assert.rejects(
        () => startPublicRepConnection(store, client.connectionInviteToken, {
            provider: "google",
            firstName: "",
            lastName: "Martin",
            role: "junior",
        }),
        /prénom et le nom sont obligatoires/,
    );
});

test("startPublicRepConnection throws for invalid role", async (t) => {
    const {store} = withTempStore(t);
    const {client} = store.createClient({name: "TestCo", ...CLIENT_CONTACT});

    await assert.rejects(
        () => startPublicRepConnection(store, client.connectionInviteToken, {
            provider: "google",
            firstName: "Alice",
            lastName: "Martin",
            role: "director",
        }),
        /Rôle de rep invalide/,
    );
});

test("startPublicRepConnection creates rep and starts connection for valid payload", async (t) => {
    const {store} = withTempStore(t);
    const {client} = store.createClient({name: "TestCo", ...CLIENT_CONTACT});

    const result = await startPublicRepConnection(store, client.connectionInviteToken, {
        provider: "google",
        firstName: "Alice",
        lastName: "Martin",
        role: "junior",
    });

    assert.ok(result);
});
