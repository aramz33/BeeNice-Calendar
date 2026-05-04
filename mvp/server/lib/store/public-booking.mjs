import {
  addMinutes,
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  getDay,
  parseISO,
  startOfWeek,
} from "date-fns";
import { clampDate, maxDate, parseOptionalIso } from "../utils.mjs";

export function getPublicBookingPayload(store, providerMode, slug) {
  const bookingLink = store.getBookingLinkBySlug(slug);
  if (!bookingLink) {
    throw new Error("Booking link introuvable.");
  }

  const client = store.getClient(bookingLink.clientId);
  const routingPolicy = store.getRoutingPolicy(bookingLink.id);
  const reps = store.getRepsForLink(bookingLink.id).map((rep) =>
    store.decorateRep(rep),
  );

  return {
    bookingLink: {
      id: bookingLink.id,
      slug: bookingLink.slug,
      clientId: bookingLink.clientId,
      title: bookingLink.title,
      clientName: client?.name ?? "Client inconnu",
      timezone: bookingLink.timezone,
      durationMinutes: bookingLink.durationMinutes,
      intervalMinutes: bookingLink.intervalMinutes,
      bufferBeforeMinutes: bookingLink.bufferBeforeMinutes,
      bufferAfterMinutes: bookingLink.bufferAfterMinutes,
      routingMode: client?.routingMode ?? "pool_unique",
      companySizeThreshold: routingPolicy?.companySizeThreshold ?? 200,
      providerMode: providerMode === "nylas" ? "nylas" : "mock",
      reps: reps.map((rep) => ({
        id: rep.id,
        name: rep.name,
        seniority: rep.seniority,
        connectionStatus: rep.connectionStatus,
      })),
    },
    callers: store.listActiveCallers(),
    workspaces: store.listPublicBookingLinks(),
  };
}

export function listCallerBookings(
  db,
  store,
  slug,
  callerId,
  activeScheduleStates,
  fromBookingRow,
) {
  const bookingLink = store.getBookingLinkBySlug(slug);
  if (!bookingLink) {
    throw new Error("Booking link introuvable.");
  }

  const bookings = db
    .prepare(`
      SELECT *
      FROM bookings
      WHERE booking_link_id = ? AND caller_id = ?
      ORDER BY start_at DESC
    `)
    .all(bookingLink.id, callerId)
    .map(fromBookingRow)
    .map((booking) => store.toBookingSummary(booking));

  const upcomingBookings = bookings
    .filter(
      (booking) =>
        activeScheduleStates.has(booking.scheduleState) &&
        booking.outcomeState === "pending" &&
        parseISO(booking.startAt) >= new Date(),
    )
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  const historicalBookings = bookings
    .filter(
      (booking) => !upcomingBookings.some((candidate) => candidate.id === booking.id),
    )
    .sort((left, right) => right.startAt.localeCompare(left.startAt))
    .slice(0, 6);

  return {
    timezone: bookingLink.timezone,
    bookings: [...upcomingBookings, ...historicalBookings],
    tasks: store.listCallerTasks(callerId, bookingLink.clientId).tasks,
  };
}

export async function buildAvailability(
  store,
  bookingLink,
  companySizeValue,
  filters = {},
  options = {},
  { bookingWindowWeeks, weekStartsOn },
) {
  const companySize = Number(companySizeValue);
  if (Number.isNaN(companySize)) {
    throw new Error("Taille d'entreprise invalide.");
  }
  const minimumStart = addMinutes(new Date(), bookingLink.minNoticeMinutes);
  const firstWeekStart = startOfWeek(minimumStart, {
    weekStartsOn,
  });
  const maximumWindowEnd = endOfWeek(
    addWeeks(firstWeekStart, bookingWindowWeeks - 1),
    { weekStartsOn },
  );
  const requestedStart = parseOptionalIso(filters.from);
  const requestedEnd = parseOptionalIso(filters.to);
  const windowStart = clampDate(
    requestedStart ?? firstWeekStart,
    firstWeekStart,
    maximumWindowEnd,
  );
  const windowEnd = clampDate(
    requestedEnd ??
      endOfWeek(windowStart, {
        weekStartsOn,
      }),
    windowStart,
    maximumWindowEnd,
  );

  if (windowEnd < windowStart) {
    throw new Error("Fenêtre de disponibilité invalide.");
  }

  const interval = {
    start: maxDate(minimumStart, windowStart),
    end: windowEnd,
  };

  const eligibleReps = store.getEligibleReps(bookingLink.id, companySize);
  const busyByRep = await store.getBusyIntervalsForReps(eligibleReps, interval, {
    excludedBookingId: options.excludedBookingId ?? null,
  });
  const slots = [];
  const client = store.getClient(bookingLink.clientId);
  const policy = store.getRoutingPolicy(bookingLink.id);
  const seniorityPool =
    client?.routingMode === "weighted_seniority" &&
    companySize >= (policy?.companySizeThreshold ?? 200)
      ? "senior"
      : "all";

  for (const day of eachDayOfInterval({ start: windowStart, end: windowEnd })) {
    const weekday = getDay(day);
    if (weekday === 0 || weekday === 6) {
      continue;
    }

    for (let hour = 9; hour < 18; hour += 1) {
      for (
        let minute = 0;
        minute < 60;
        minute += Math.max(bookingLink.intervalMinutes, 1)
      ) {
        const slot = new Date(day);
        slot.setHours(hour, minute, 0, 0);

        if (slot < interval.start) {
          continue;
        }

        const availableReps = eligibleReps.filter((rep) =>
          store.isRepAvailableAgainstIntervals(
            busyByRep.get(rep.id) ?? [],
            slot,
            bookingLink,
          ),
        );

        if (availableReps.length === 0) {
          continue;
        }

        slots.push({
          startAt: slot.toISOString(),
          endAt: addMinutes(slot, bookingLink.durationMinutes).toISOString(),
          availableRepCount: availableReps.length,
          seniorityPool,
          availableRepIds: options.includeRepDetails
            ? availableReps.map((rep) => rep.id)
            : undefined,
          availableRepNames: options.includeRepDetails
            ? availableReps.map((rep) => rep.name)
            : undefined,
        });
      }
    }
  }

  return {
    timezone: bookingLink.timezone,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    maxWindowEnd: maximumWindowEnd.toISOString(),
    slots,
  };
}
