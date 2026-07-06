process.env.TZ = "UTC";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {getDay} from "date-fns";
import {toZonedTime} from "date-fns-tz";
import {createStore} from "./state.mjs";

const PARIS = "Europe/Paris";

function createProviderStub() {
    return {
        mode: "mock",
        getOverview() {
            return {providerMode: "mock", nylasConfigured: false};
        },
        async listBusyIntervals() {
            return [];
        },
    };
}

function withTempStore(t, now) {
    const previousDbPath = process.env.MVP_DB_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benice-tz-"));
    process.env.MVP_DB_PATH = path.join(tempDir, "mvp.sqlite");
    const store = createStore(createProviderStub(), {now});

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

function parisHour(iso) {
    return toZonedTime(new Date(iso), PARIS).getHours();
}

test("slots land at 08-20 Paris wall-clock even when the server runs in UTC (summer/DST)", async (t) => {
    assert.equal(process.env.TZ, "UTC", "test must run with a UTC server clock");
    const store = withTempStore(t, "2026-07-06T00:00:00.000Z");
    const availability = await store.listAvailability("teamstarter-discovery", "80");

    assert.ok(availability.slots.length > 0, "expected slots");
    const hours = availability.slots.map((slot) => parisHour(slot.startAt));
    assert.equal(Math.min(...hours), 8, "earliest slot is 08:00 Paris, not 10:00");
    assert.ok(Math.max(...hours) < 20, "latest slot starts before 20:00 Paris");
});

test("weekends stay excluded under a UTC server clock", async (t) => {
    const store = withTempStore(t, "2026-07-06T00:00:00.000Z");
    const availability = await store.listAvailability("teamstarter-discovery", "80");

    for (const slot of availability.slots) {
        const weekday = getDay(toZonedTime(new Date(slot.startAt), PARIS));
        assert.ok(weekday !== 0 && weekday !== 6, `slot ${slot.startAt} fell on a weekend`);
    }
});

test("winter slots still anchor to 08:00 Paris (offset not hardcoded)", async (t) => {
    const store = withTempStore(t, "2026-01-05T00:00:00.000Z");
    const availability = await store.listAvailability("teamstarter-discovery", "80");

    const hours = availability.slots.map((slot) => parisHour(slot.startAt));
    assert.equal(Math.min(...hours), 8, "winter earliest slot is 08:00 Paris");
});
