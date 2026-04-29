import { randomUUID } from "node:crypto";
import { addDays, isWeekend, parseISO, set } from "date-fns";

export function makeId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

export function nextBusinessMorning(referenceIso) {
  let cursor = parseISO(referenceIso);
  cursor = addDays(cursor, 1);
  while (isWeekend(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return set(cursor, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }).toISOString();
}

export function differenceInMinutesSafe(startIso, endIso) {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function parseOptionalIso(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function clampDate(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function maxDate(left, right) {
  return left > right ? left : right;
}

export function parseJson(value, fallback = {}) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
