import "temporal-polyfill/global";
import { addWeeks, startOfWeek } from "date-fns";
import type { CalendarEventExternal } from "@schedule-x/calendar";
import type {
  AvailabilityResponse,
  BookingSummary,
  DisplayStatus,
} from "@mvp/lib/types";

const WEEK_STARTS_ON = 1;

export const FORWARD_WINDOW_WEEKS = 260;

export const AVAILABLE_CALENDAR_ID = "available";
export const SELECTED_CALENDAR_ID = "selected";

export function isoToZoned(
  iso: string,
  timezone: string,
): Temporal.ZonedDateTime {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(timezone);
}

export function weekStartIsoToPlainDate(
  weekStartIso: string,
): Temporal.PlainDate {
  const date = new Date(weekStartIso);
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

export function plainDateWeeksFromNow(weeks: number): Temporal.PlainDate {
  const date = startOfWeek(addWeeks(new Date(), weeks), {
    weekStartsOn: WEEK_STARTS_ON,
  });
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

export function currentWeekStartPlainDate(): Temporal.PlainDate {
  return plainDateWeeksFromNow(0);
}

export function forwardMaxPlainDate(): Temporal.PlainDate {
  return plainDateWeeksFromNow(FORWARD_WINDOW_WEEKS);
}

export function rangeStartToWeekStartIso(
  rangeStart: Temporal.ZonedDateTime,
): string {
  const localMonday = new Date(
    rangeStart.year,
    rangeStart.month - 1,
    rangeStart.day,
  );
  return startOfWeek(localMonday, {
    weekStartsOn: WEEK_STARTS_ON,
  }).toISOString();
}

export function slotsToEvents(
  availability: AvailabilityResponse | null,
  selectedSlotIso: string | null,
): CalendarEventExternal[] {
  if (!availability) {
    return [];
  }

  return availability.slots.map((slot) => ({
    id: slot.startAt.replace(/[:.]/g, "-"),
    slotIso: slot.startAt,
    start: isoToZoned(slot.startAt, availability.timezone),
    end: isoToZoned(slot.endAt, availability.timezone),
    title: `${slot.availableRepCount} rep${
      slot.availableRepCount > 1 ? "s" : ""
    } dispo`,
    calendarId:
      slot.startAt === selectedSlotIso
        ? SELECTED_CALENDAR_ID
        : AVAILABLE_CALENDAR_ID,
    availableRepCount: slot.availableRepCount,
  }));
}

export function bookingsToEvents(
  entries: BookingSummary[],
  selectedBookingId: string | null,
): CalendarEventExternal[] {
  return entries.map((booking) => ({
    id: booking.id,
    start: isoToZoned(booking.startAt, booking.timezone),
    end: isoToZoned(booking.endAt, booking.timezone),
    title: `${booking.clientName} · ${booking.prospectName}`,
    calendarId:
      booking.id === selectedBookingId
        ? SELECTED_CALENDAR_ID
        : booking.displayStatus,
    displayStatus: booking.displayStatus,
  }));
}

type CalendarColors = {
  colorName: string;
  lightColors: { main: string; container: string; onContainer: string };
};

const STATUS_COLORS: Record<DisplayStatus, CalendarColors["lightColors"]> = {
  scheduled: { main: "#F7A600", container: "#FFE6A8", onContainer: "#92600A" },
  completed: { main: "#047857", container: "#D1FAE5", onContainer: "#065F46" },
  no_show: { main: "#7C3AED", container: "#EDE4FD", onContainer: "#5B21B6" },
  cancelled: { main: "#E11D48", container: "#FFE4E6", onContainer: "#9F1239" },
  rescheduled: {
    main: "#0284C7",
    container: "#E0F2FE",
    onContainer: "#075985",
  },
  not_qualified: {
    main: "#78716C",
    container: "#F5F5F4",
    onContainer: "#44403C",
  },
  mvn: { main: "#D97706", container: "#FEF3C7", onContainer: "#92400E" },
  refused: { main: "#BE123C", container: "#FECDD3", onContainer: "#881337" },
};

export const CALENDARS: Record<string, CalendarColors> = {
  [AVAILABLE_CALENDAR_ID]: {
    colorName: AVAILABLE_CALENDAR_ID,
    lightColors: {
      main: "#047857",
      container: "#D1FAE5",
      onContainer: "#065F46",
    },
  },
  [SELECTED_CALENDAR_ID]: {
    colorName: SELECTED_CALENDAR_ID,
    lightColors: {
      main: "#001E5B",
      container: "#001E5B",
      onContainer: "#FFFFFF",
    },
  },
  ...Object.fromEntries(
    Object.entries(STATUS_COLORS).map(([status, lightColors]) => [
      status,
      { colorName: status, lightColors },
    ]),
  ),
};
