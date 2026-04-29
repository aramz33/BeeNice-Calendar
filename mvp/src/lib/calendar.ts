import { parseISO } from "date-fns";
import { formatTimeOnly } from "@mvp/lib/time";
import type { BookingSummary } from "@mvp/lib/types";

export const CALENDAR_START_HOUR = 9;
export const CALENDAR_END_HOUR = 18;
export const SLOT_MINUTES = 30;
export const SLOT_HEIGHT_PX = 44;
export const TOTAL_SLOTS =
  (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * (60 / SLOT_MINUTES);
export const TOTAL_HEIGHT_PX = TOTAL_SLOTS * SLOT_HEIGHT_PX;
export const CALENDAR_START_MINUTES = CALENDAR_START_HOUR * 60;
export const CALENDAR_END_MINUTES = CALENDAR_END_HOUR * 60;
export const CALENDAR_HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, i) => CALENDAR_START_HOUR + i,
);

export type EventTiming = {
  entry: BookingSummary;
  startMin: number;
  endMin: number;
  visibleStartMin: number;
  visibleEndMin: number;
};

export function parseIsoSafe(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function getTimeInMinutes(
  iso: string | null | undefined,
  timezone: string,
): number | null {
  if (typeof iso !== "string" || !iso) {
    return null;
  }

  const timeStr = formatTimeOnly(iso, timezone);
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m ?? 0)) {
    return null;
  }

  return h * 60 + (m ?? 0);
}

export function getEventTiming(
  entry: BookingSummary,
  timezone: string,
): EventTiming | null {
  const startMin = getTimeInMinutes(entry.startAt, timezone);
  if (startMin === null) {
    return null;
  }

  const startAt = parseIsoSafe(entry.startAt);
  const endAt = parseIsoSafe(entry.endAt);
  const durationMinutes =
    startAt && endAt
      ? Math.max(
          SLOT_MINUTES,
          Math.round((endAt.getTime() - startAt.getTime()) / (60 * 1000)),
        )
      : SLOT_MINUTES;
  const endMin = startMin + durationMinutes;

  return {
    entry,
    startMin,
    endMin,
    visibleStartMin: Math.max(startMin, CALENDAR_START_MINUTES),
    visibleEndMin: Math.min(endMin, CALENDAR_END_MINUTES),
  };
}

export function calcEventTop(startMin: number): number {
  return ((startMin - CALENDAR_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

export function calcEventHeight(startMin: number, endMin: number): number {
  return ((endMin - startMin) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

export function isEventInRange(
  entry: BookingSummary,
  timezone: string,
): boolean {
  const timing = getEventTiming(entry, timezone);
  return timing ? timing.visibleStartMin < timing.visibleEndMin : false;
}

export type TrackAssignment = {
  entry: BookingSummary;
  track: number;
  trackCount: number;
  top: number;
  height: number;
};

export function assignTracks(
  events: BookingSummary[],
  timezone: string,
): TrackAssignment[] {
  const sorted = events
    .map((entry) => getEventTiming(entry, timezone))
    .filter((timing): timing is EventTiming => timing !== null)
    .sort((a, b) => {
      if (a.startMin !== b.startMin) {
        return a.startMin - b.startMin;
      }
      return a.endMin - b.endMin;
    });

  const trackEnds: number[] = [];
  const result: Array<EventTiming & { track: number; trackCount: number; top: number; height: number }> = [];

  sorted.forEach((timing) => {
    const { entry, startMin, endMin, visibleStartMin, visibleEndMin } = timing;
    let track = trackEnds.findIndex((end) => end <= startMin);
    if (track === -1) track = trackEnds.length;
    trackEnds[track] = endMin;
    result.push({
      entry,
      track,
      trackCount: 0,
      startMin,
      endMin,
      visibleStartMin,
      visibleEndMin,
      top: calcEventTop(visibleStartMin),
      height: calcEventHeight(visibleStartMin, visibleEndMin),
    });
  });

  result.forEach((item) => {
    item.trackCount = result.filter(
      (other) => other.startMin < item.endMin && other.endMin > item.startMin,
    ).length;
  });

  return result.map(({ startMin: _s, endMin: _e, visibleStartMin: _vs, visibleEndMin: _ve, ...item }) => item);
}
