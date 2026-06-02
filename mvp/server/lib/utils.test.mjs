import test from "node:test";
import assert from "node:assert/strict";
import { isWeekend, getHours, parseISO } from "date-fns";
import {
  makeId,
  nextBusinessMorning,
  differenceInMinutesSafe,
  parseOptionalIso,
  clampDate,
  maxDate,
  parseJson,
} from "./utils.mjs";

test("makeId prefixes with given prefix", () => {
  const id = makeId("task");
  assert.match(id, /^task-[0-9a-f-]{36}$/);
});

test("makeId generates unique values", () => {
  const ids = new Set(Array.from({ length: 20 }, () => makeId("x")));
  assert.equal(ids.size, 20);
});

test("nextBusinessMorning returns a weekday at 9am local", () => {
  // Friday local time → skips Saturday and Sunday → Monday
  const result = nextBusinessMorning("2026-06-05T14:00:00");
  const date = parseISO(result);
  assert.ok(!isWeekend(date), "result should not be a weekend");
  assert.equal(getHours(date), 9);
});

test("nextBusinessMorning on Thursday returns Friday", () => {
  const result = nextBusinessMorning("2026-06-04T10:00:00");
  const date = parseISO(result);
  assert.ok(!isWeekend(date));
  assert.equal(getHours(date), 9);
});

test("nextBusinessMorning on Saturday skips to Monday", () => {
  const result = nextBusinessMorning("2026-06-06T10:00:00");
  const date = parseISO(result);
  assert.ok(!isWeekend(date));
  assert.equal(getHours(date), 9);
});

test("differenceInMinutesSafe returns exact difference", () => {
  const diff = differenceInMinutesSafe(
    "2026-06-02T10:00:00.000Z",
    "2026-06-02T10:45:00.000Z",
  );
  assert.equal(diff, 45);
});

test("differenceInMinutesSafe clamps to minimum 15 minutes", () => {
  const diff = differenceInMinutesSafe(
    "2026-06-02T10:00:00.000Z",
    "2026-06-02T10:05:00.000Z",
  );
  assert.equal(diff, 15);
});

test("differenceInMinutesSafe clamps to 15 when start equals end", () => {
  const diff = differenceInMinutesSafe(
    "2026-06-02T10:00:00.000Z",
    "2026-06-02T10:00:00.000Z",
  );
  assert.equal(diff, 15);
});

test("parseOptionalIso returns null for non-string", () => {
  assert.equal(parseOptionalIso(null), null);
  assert.equal(parseOptionalIso(undefined), null);
  assert.equal(parseOptionalIso(42), null);
});

test("parseOptionalIso returns null for empty string", () => {
  assert.equal(parseOptionalIso(""), null);
});

test("parseOptionalIso returns null for invalid date string", () => {
  assert.equal(parseOptionalIso("not-a-date"), null);
});

test("parseOptionalIso returns Date for valid iso string", () => {
  const result = parseOptionalIso("2026-06-02T10:00:00.000Z");
  assert.ok(result instanceof Date);
  assert.equal(result.toISOString(), "2026-06-02T10:00:00.000Z");
});

test("clampDate returns min when value is below min", () => {
  const min = new Date("2026-01-01");
  const max = new Date("2026-12-31");
  const val = new Date("2025-01-01");
  assert.equal(clampDate(val, min, max), min);
});

test("clampDate returns max when value is above max", () => {
  const min = new Date("2026-01-01");
  const max = new Date("2026-06-01");
  const val = new Date("2027-01-01");
  assert.equal(clampDate(val, min, max), max);
});

test("clampDate returns value when in range", () => {
  const min = new Date("2026-01-01");
  const max = new Date("2026-12-31");
  const val = new Date("2026-06-02");
  assert.equal(clampDate(val, min, max), val);
});

test("maxDate returns the larger date", () => {
  const a = new Date("2026-06-01");
  const b = new Date("2026-06-02");
  assert.equal(maxDate(a, b), b);
  assert.equal(maxDate(b, a), b);
});

test("maxDate returns a date with the same value when both are equal", () => {
  const a = new Date("2026-06-01");
  const b = new Date("2026-06-01");
  assert.equal(maxDate(a, b).getTime(), a.getTime());
});

test("parseJson parses valid JSON object", () => {
  assert.deepEqual(parseJson('{"a":1,"b":"x"}'), { a: 1, b: "x" });
});

test("parseJson returns default fallback for invalid JSON", () => {
  assert.deepEqual(parseJson("invalid json {"), {});
});

test("parseJson returns custom fallback for invalid JSON", () => {
  assert.deepEqual(parseJson("bad", []), []);
});

test("parseJson returns fallback for null", () => {
  assert.deepEqual(parseJson(null), {});
});

test("parseJson returns fallback for empty string", () => {
  assert.deepEqual(parseJson(""), {});
});
