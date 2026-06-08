import {
    addDays,
    addMinutes,
    addWeeks,
    eachDayOfInterval,
    endOfWeek,
    getDay,
    parseISO,
    startOfWeek,
    subMinutes,
} from "date-fns";
import {getConnection} from "./connections.mjs";
import {clampDate, maxDate, parseOptionalIso} from "./utils.mjs";

const DEFAULT_BOOKING_WINDOW_WEEKS = 12;
const DEFAULT_WEEK_STARTS_ON = 1;

export function createAvailabilityModule({
                                             db,
                                             store,
                                             provider,
                                             config = {},
                                         }) {
    const bookingWindowWeeks =
        config.bookingWindowWeeks ?? DEFAULT_BOOKING_WINDOW_WEEKS;
    const weekStartsOn = config.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
    const getNow = () => (config.now ? new Date(config.now) : new Date());

    return {
        async buildSlots(bookingLink, companySizeValue, filters = {}, options = {}) {
            const companySize = parseCompanySize(companySizeValue);
            const minimumStart = addMinutes(getNow(), bookingLink.minNoticeMinutes);
            const firstWeekStart = startOfWeek(minimumStart, {
                weekStartsOn,
            });
            const maximumWindowEnd = endOfWeek(
                addWeeks(firstWeekStart, bookingWindowWeeks - 1),
                {weekStartsOn},
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

            const eligibleReps = getEligibleReps(store, bookingLink.id, companySize);
            const busyByRep = await getBusyIntervalsForReps(
                db,
                store,
                provider,
                bookingLink,
                eligibleReps,
                interval,
                {
                    excludedBookingId: options.excludedBookingId ?? null,
                },
            );
            const slots = [];
            const seniorityPool = getSeniorityPool(store, bookingLink, companySize);

            for (const day of eachDayOfInterval({start: windowStart, end: windowEnd})) {
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
                            isRepAvailableAgainstIntervals(
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
        },

        async assignRepForSlot(bookingLink, companySizeValue, slotStartValue, options = {}) {
            const companySize = parseCompanySize(companySizeValue);
            const slotStart = parseSlotStart(slotStartValue);
            const availableEligibleReps = await getAvailableEligibleRepsForSlot(
                db,
                store,
                provider,
                bookingLink,
                companySize,
                slotStart,
                {
                    excludedBookingId: options.excludedBookingId ?? null,
                },
            );

            if (availableEligibleReps.length === 0) {
                throw new Error("Le créneau sélectionné n'est plus disponible.");
            }

            return assignRep(db, store, bookingLink, companySize, availableEligibleReps, getNow);
        },
    };
}

function parseCompanySize(value) {
    const companySize = Number(value);
    if (Number.isNaN(companySize)) {
        throw new Error("Taille d'entreprise invalide.");
    }
    return companySize;
}

function parseSlotStart(value) {
    const slotStart = value instanceof Date ? value : parseISO(String(value));
    if (Number.isNaN(slotStart.getTime())) {
        throw new Error("Créneau invalide.");
    }
    return slotStart;
}

function getSeniorityPool(store, bookingLink, companySize) {
    const client = store.getClient(bookingLink.clientId);
    const policy = store.getRoutingPolicy(bookingLink.id);
    return client?.routingMode === "weighted_seniority" &&
    companySize >= (policy?.companySizeThreshold ?? 200)
        ? "senior"
        : "all";
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function isRepAvailableAgainstIntervals(intervals, slotStart, bookingLink) {
  const slotEnd = addMinutes(slotStart, bookingLink.durationMinutes);
  const busyStart = subMinutes(slotStart, bookingLink.bufferBeforeMinutes);
  const busyEnd = addMinutes(slotEnd, bookingLink.bufferAfterMinutes);

  return !intervals.some((interval) =>
    rangesOverlap(busyStart, busyEnd, interval.startAt, interval.endAt),
  );
}

function getRepRollingLoad(db, repId, bookingLinkId, getNow = () => new Date()) {
  const lowerBound = addDays(getNow(), -30).toISOString();
  const row = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE assigned_rep_id = ?
        AND booking_link_id = ?
        AND created_at >= ?
    `)
    .get(repId, bookingLinkId, lowerBound);
  return row?.count ?? 0;
}

function getRollingCounts(db, store, bookingLinkId, getNow = () => new Date()) {
  const lowerBound = addDays(getNow(), -30).toISOString();
  const rows = db
    .prepare(`
      SELECT assigned_rep_id
      FROM bookings
      WHERE booking_link_id = ?
        AND created_at >= ?
    `)
    .all(bookingLinkId, lowerBound);

  const counts = { senior: 0, junior: 0, non_defini: 0 };
  rows.forEach((row) => {
    const rep = store.getRep(row.assigned_rep_id);
    if (rep && Object.hasOwn(counts, rep.seniority)) {
      counts[rep.seniority] += 1;
    }
  });
  return counts;
}

function getEligibleReps(store, bookingLinkId, companySize) {
  const reps = store.getRepsForLink(bookingLinkId);
  const bookingLink = store.getBookingLinkById(bookingLinkId);
  const client = bookingLink ? store.getClient(bookingLink.clientId) : null;
  const policy = store.getRoutingPolicy(bookingLinkId);
  if (!policy || client?.routingMode !== "weighted_seniority") {
    return reps;
  }
  if (companySize >= policy.companySizeThreshold) {
    return reps.filter((rep) => rep.seniority === "senior");
  }
  return reps;
}

function getMaxBookingBuffers(db, bookingLink) {
  const row = db
    .prepare(`
      SELECT
        COALESCE(MAX(buffer_before_minutes), 0) AS max_before,
        COALESCE(MAX(buffer_after_minutes), 0) AS max_after
      FROM booking_links
    `)
    .get();

  return {
    before: Math.max(bookingLink.bufferBeforeMinutes, row?.max_before ?? 0),
    after: Math.max(bookingLink.bufferAfterMinutes, row?.max_after ?? 0),
  };
}

async function getBusyIntervals(db, store, provider, bookingLink, repId, interval, options = {}) {
  const busyLookupInterval = {
    start: subMinutes(interval.start, bookingLink.bufferBeforeMinutes),
    end: addMinutes(interval.end, bookingLink.bufferAfterMinutes),
  };
  const bookingLookupInterval = {
    start: subMinutes(
      interval.start,
      options.maxBookingBufferAfterMinutes ?? bookingLink.bufferAfterMinutes,
    ),
    end: addMinutes(
      interval.end,
      options.maxBookingBufferBeforeMinutes ?? bookingLink.bufferBeforeMinutes,
    ),
  };

  const localCalendarBusy = db
    .prepare(`
      SELECT start_at, end_at
      FROM calendar_events
      WHERE rep_id = ?
        AND end_at > ?
        AND start_at < ?
    `)
    .all(repId, busyLookupInterval.start.toISOString(), busyLookupInterval.end.toISOString())
    .map((event) => ({
      startAt: parseISO(event.start_at),
      endAt: parseISO(event.end_at),
    }));

  const bookingBusy = db
    .prepare(`
      SELECT
        bookings.start_at,
        bookings.end_at,
        booking_links.buffer_before_minutes,
        booking_links.buffer_after_minutes
      FROM bookings
      JOIN booking_links ON booking_links.id = bookings.booking_link_id
      WHERE assigned_rep_id = ?
        AND bookings.end_at > ?
        AND bookings.start_at < ?
        AND bookings.schedule_state != 'cancelled'
        AND (? IS NULL OR bookings.id != ?)
    `)
    .all(
      repId,
      bookingLookupInterval.start.toISOString(),
      bookingLookupInterval.end.toISOString(),
      options.excludedBookingId ?? null,
      options.excludedBookingId ?? null,
    )
    .map((booking) => ({
      startAt: subMinutes(parseISO(booking.start_at), booking.buffer_before_minutes),
      endAt: addMinutes(parseISO(booking.end_at), booking.buffer_after_minutes),
    }));

  const rep = store.getRep(repId);
  const connection = getConnection(db, repId);
  const providerBusy =
    rep && connection
      ? await provider.listBusyIntervals(store, rep, connection, busyLookupInterval)
      : [];

  return [...localCalendarBusy, ...bookingBusy, ...providerBusy];
}

async function getBusyIntervalsForReps(db, store, provider, bookingLink, reps, interval, options = {}) {
  const maxBookingBuffers = getMaxBookingBuffers(db, bookingLink);
  const entries = await Promise.all(
    reps.map(async (rep) => [
      rep.id,
      await getBusyIntervals(db, store, provider, bookingLink, rep.id, interval, {
        ...options,
        maxBookingBufferBeforeMinutes: maxBookingBuffers.before,
        maxBookingBufferAfterMinutes: maxBookingBuffers.after,
      }),
    ]),
  );
  return new Map(entries);
}

async function getAvailableEligibleRepsForSlot(db, store, provider, bookingLink, companySize, slotStart, options = {}) {
  const eligibleReps = getEligibleReps(store, bookingLink.id, companySize);
  const interval = {
    start: subMinutes(slotStart, bookingLink.bufferBeforeMinutes),
    end: addMinutes(
      addMinutes(slotStart, bookingLink.durationMinutes),
      bookingLink.bufferAfterMinutes,
    ),
  };
  const busyByRep = await getBusyIntervalsForReps(db, store, provider, bookingLink, eligibleReps, interval, {
    excludedBookingId: options.excludedBookingId ?? null,
  });
  return eligibleReps.filter((rep) =>
    isRepAvailableAgainstIntervals(
      busyByRep.get(rep.id) ?? [],
      slotStart,
      bookingLink,
    ),
  );
}

function assignRep(db, store, bookingLink, companySize, eligibleReps, getNow = () => new Date()) {
  if (eligibleReps.length === 0) {
    throw new Error("Aucun rep disponible pour ce créneau.");
  }

  const client = store.getClient(bookingLink.clientId);
  const policy = store.getRoutingPolicy(bookingLink.id);
  if (!policy || client?.routingMode !== "weighted_seniority") {
    const rep = [...eligibleReps].sort((left, right) => {
      const loadDelta =
        getRepRollingLoad(db, left.id, bookingLink.id, getNow) -
        getRepRollingLoad(db, right.id, bookingLink.id, getNow);
      if (loadDelta !== 0) {
        return loadDelta;
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.id.localeCompare(right.id);
    })[0];

    return {
      rep,
      reason: {
        routingMode: client?.routingMode ?? "pool_unique",
        companySizeThreshold: policy?.companySizeThreshold ?? 0,
        seniorityPool: "all",
        chosenRole: "pool_unique",
        roleDeficits: null,
        candidateRepIds: eligibleReps.map((candidate) => candidate.id),
      },
    };
  }

  const counts = getRollingCounts(db, store, bookingLink.id, getNow);
  const total = counts.senior + counts.junior;
  const deficits = {
    senior: (total + 1) * policy.seniorWeight - counts.senior,
    junior: (total + 1) * policy.juniorWeight - counts.junior,
  };

  const byRole = {
    senior: eligibleReps.filter((rep) => rep.seniority === "senior"),
    junior: eligibleReps.filter((rep) => rep.seniority === "junior"),
    non_defini: eligibleReps.filter((rep) => rep.seniority === "non_defini"),
  };

  let chosenRole = "senior";
  if (byRole.senior.length === 0) {
    chosenRole = byRole.junior.length > 0 ? "junior" : "non_defini";
  } else if (byRole.junior.length === 0) {
    chosenRole = "senior";
  } else if (deficits.junior > deficits.senior) {
    chosenRole = "junior";
  }

  const rep = [...byRole[chosenRole]].sort((left, right) => {
    const loadDelta =
      getRepRollingLoad(db, left.id, bookingLink.id) -
      getRepRollingLoad(db, right.id, bookingLink.id);
    if (loadDelta !== 0) {
      return loadDelta;
    }
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.id.localeCompare(right.id);
  })[0];

  return {
    rep,
    reason: {
      routingMode: "weighted_seniority",
      companySizeThreshold: policy.companySizeThreshold,
      seniorityPool:
        companySize >= policy.companySizeThreshold ? "senior" : "all",
      chosenRole,
      roleDeficits: deficits,
      candidateRepIds: eligibleReps.map((candidate) => candidate.id),
    },
  };
}
