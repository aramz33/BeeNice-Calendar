import { describe, expect, it } from "vitest";
import {
  AVAILABLE_CALENDAR_ID,
  SELECTED_CALENDAR_ID,
  bookingsToEvents,
  isoToZoned,
  slotsToEvents,
} from "@mvp/lib/schedule-x";
import type { AvailabilityResponse, BookingSummary } from "@mvp/lib/types";

function availability(
  slots: AvailabilityResponse["slots"],
  timezone = "Europe/Paris",
): AvailabilityResponse {
  return {
    timezone,
    windowStart: "2026-06-22T00:00:00.000Z",
    windowEnd: "2026-06-26T22:00:00.000Z",
    maxWindowEnd: "2026-09-14T22:00:00.000Z",
    slots,
  };
}

describe("isoToZoned", () => {
  it("renders UTC instant as Europe/Paris wall time (summer +2)", () => {
    const zoned = isoToZoned("2026-06-25T07:00:00.000Z", "Europe/Paris");
    expect(zoned.hour).toBe(9);
    expect(zoned.timeZoneId).toBe("Europe/Paris");
  });
});

describe("slotsToEvents", () => {
  const slots = [
    {
      startAt: "2026-06-25T07:00:00.000Z",
      endAt: "2026-06-25T07:30:00.000Z",
      availableRepCount: 3,
      seniorityPool: "all" as const,
    },
    {
      startAt: "2026-06-25T08:00:00.000Z",
      endAt: "2026-06-25T08:30:00.000Z",
      availableRepCount: 1,
      seniorityPool: "all" as const,
    },
  ];

  it("returns null-safe empty array", () => {
    expect(slotsToEvents(null, null)).toEqual([]);
  });

  it("maps slot startAt to a querySelector-safe event id and keeps raw iso", () => {
    const events = slotsToEvents(
      availability(slots),
      "2026-06-25T08:00:00.000Z",
    );
    expect(events.map((e) => e.id)).toEqual([
      "2026-06-25T07-00-00-000Z",
      "2026-06-25T08-00-00-000Z",
    ]);
    expect(events.map((e) => e.slotIso)).toEqual([
      "2026-06-25T07:00:00.000Z",
      "2026-06-25T08:00:00.000Z",
    ]);
    expect(events[0].calendarId).toBe(AVAILABLE_CALENDAR_ID);
    expect(events[1].calendarId).toBe(SELECTED_CALENDAR_ID);
  });

  it("pluralizes rep count in the title", () => {
    const events = slotsToEvents(availability(slots), null);
    expect(events[0].title).toBe("3 reps dispo");
    expect(events[1].title).toBe("1 rep dispo");
  });
});

describe("bookingsToEvents", () => {
  const booking = {
    id: "bk1",
    displayStatus: "scheduled",
    startAt: "2026-06-25T07:00:00.000Z",
    endAt: "2026-06-25T07:30:00.000Z",
    timezone: "Europe/Paris",
    clientName: "Doctolib",
    prospectName: "Alice Dupont",
  } as BookingSummary;

  it("uses booking id as event id and status as calendarId", () => {
    const [event] = bookingsToEvents([booking], null);
    expect(event.id).toBe("bk1");
    expect(event.calendarId).toBe("scheduled");
    expect(event.title).toBe("Doctolib · Alice Dupont");
  });

  it("overrides calendarId to selected for the selected booking", () => {
    const [event] = bookingsToEvents([booking], "bk1");
    expect(event.calendarId).toBe(SELECTED_CALENDAR_ID);
  });
});
