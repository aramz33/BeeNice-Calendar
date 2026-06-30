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
import {computeEffectiveWeights, selectRep} from "./routing.mjs";
import {clampDate, maxDate, parseOptionalIso} from "./utils.mjs";

const DEFAULT_BOOKING_WINDOW_WEEKS = 260;
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

            const eligibleReps = getEligibleReps(store, bookingLink.id);
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
            const seniorityPool = getSeniorityPool();

            for (const day of eachDayOfInterval({start: windowStart, end: windowEnd})) {
                const weekday = getDay(day);
                if (weekday === 0 || weekday === 6) {
                    continue;
                }

                for (let hour = 8; hour < 20; hour += 1) {
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
    if (value === undefined || value === null || value === '') return 0;
    const companySize = Number(value);
    return Number.isNaN(companySize) ? 0 : companySize;
}

function parseSlotStart(value) {
    const slotStart = value instanceof Date ? value : parseISO(String(value));
    if (Number.isNaN(slotStart.getTime())) {
        throw new Error("Créneau invalide.");
    }
    return slotStart;
}

// ponytail: company size no longer affects routing — every connected rep is eligible.
function getSeniorityPool() {
    return "all";
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

// ponytail: company size no longer filters reps — kept the param for call-site stability.
function getEligibleReps(store, bookingLinkId) {
  return store.getRepsForLink(bookingLinkId);
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
  const eligibleReps = getEligibleReps(store, bookingLink.id);
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

  const effectiveWeights = computeEffectiveWeights(eligibleReps);
  const repsWithLoad = eligibleReps.map((rep) => ({
    ...rep,
    rollingCount: getRepRollingLoad(db, rep.id, bookingLink.id, getNow),
    effectiveWeight: effectiveWeights.get(rep.id) ?? 0,
  }));

  const selection = selectRep(repsWithLoad);

  return {
    rep: selection.rep,
    reason: {
      routingMode: "percentage",
      seniorityPool: "all",
      candidateRepIds: selection.reason.candidateRepIds,
      effectiveWeights: selection.reason.effectiveWeights,
      rollingCounts: selection.reason.rollingCounts,
    },
  };
}
