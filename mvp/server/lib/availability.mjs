import { addDays, addMinutes, parseISO, subMinutes } from "date-fns";
import { getConnection } from "./connections.mjs";

// --- Pure helpers ---

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function isRepAvailableAgainstIntervals(intervals, slotStart, bookingLink) {
  const slotEnd = addMinutes(slotStart, bookingLink.durationMinutes);
  const busyStart = subMinutes(slotStart, bookingLink.bufferBeforeMinutes);
  const busyEnd = addMinutes(slotEnd, bookingLink.bufferAfterMinutes);

  return !intervals.some((interval) =>
    rangesOverlap(busyStart, busyEnd, interval.startAt, interval.endAt),
  );
}

// --- DB query helpers ---

export function getRepRollingLoad(db, repId, bookingLinkId) {
  const lowerBound = addDays(new Date(), -30).toISOString();
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

export function getRollingCounts(db, store, bookingLinkId) {
  const lowerBound = addDays(new Date(), -30).toISOString();
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

// --- Core availability logic ---

export function getEligibleReps(store, bookingLinkId, companySize) {
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

export async function getBusyIntervals(db, store, provider, repId, interval, options = {}) {
  const localCalendarBusy = db
    .prepare(`
      SELECT start_at, end_at
      FROM calendar_events
      WHERE rep_id = ?
        AND end_at > ?
        AND start_at < ?
    `)
    .all(repId, interval.start.toISOString(), interval.end.toISOString())
    .map((event) => ({
      startAt: parseISO(event.start_at),
      endAt: parseISO(event.end_at),
    }));

  const bookingBusy = db
    .prepare(`
      SELECT start_at, end_at
      FROM bookings
      WHERE assigned_rep_id = ?
        AND end_at > ?
        AND start_at < ?
        AND schedule_state != 'cancelled'
        AND (? IS NULL OR id != ?)
    `)
    .all(
      repId,
      interval.start.toISOString(),
      interval.end.toISOString(),
      options.excludedBookingId ?? null,
      options.excludedBookingId ?? null,
    )
    .map((booking) => ({
      startAt: parseISO(booking.start_at),
      endAt: parseISO(booking.end_at),
    }));

  const rep = store.getRep(repId);
  const connection = getConnection(db, repId);
  const providerBusy =
    rep && connection
      ? await provider.listBusyIntervals(store, rep, connection, interval)
      : [];

  return [...localCalendarBusy, ...bookingBusy, ...providerBusy];
}

export async function getBusyIntervalsForReps(db, store, provider, reps, interval, options = {}) {
  const entries = await Promise.all(
    reps.map(async (rep) => [
      rep.id,
      await getBusyIntervals(db, store, provider, rep.id, interval, options),
    ]),
  );
  return new Map(entries);
}

export async function getAvailableEligibleRepsForSlot(db, store, provider, bookingLink, companySize, slotStart, options = {}) {
  const eligibleReps = getEligibleReps(store, bookingLink.id, companySize);
  const interval = {
    start: subMinutes(slotStart, bookingLink.bufferBeforeMinutes),
    end: addMinutes(
      addMinutes(slotStart, bookingLink.durationMinutes),
      bookingLink.bufferAfterMinutes,
    ),
  };
  const busyByRep = await getBusyIntervalsForReps(db, store, provider, eligibleReps, interval, {
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

export function assignRep(db, store, bookingLink, companySize, _slotStart, eligibleReps) {
  if (eligibleReps.length === 0) {
    throw new Error("Aucun rep disponible pour ce créneau.");
  }

  const client = store.getClient(bookingLink.clientId);
  const policy = store.getRoutingPolicy(bookingLink.id);
  if (!policy || client?.routingMode !== "weighted_seniority") {
    const rep = [...eligibleReps].sort((left, right) => {
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
        routingMode: client?.routingMode ?? "pool_unique",
        companySizeThreshold: policy?.companySizeThreshold ?? 0,
        seniorityPool: "all",
        chosenRole: "pool_unique",
        roleDeficits: null,
        candidateRepIds: eligibleReps.map((candidate) => candidate.id),
      },
    };
  }

  const counts = getRollingCounts(db, store, bookingLink.id);
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
