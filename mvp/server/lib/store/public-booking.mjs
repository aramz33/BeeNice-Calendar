import {parseISO} from "date-fns";

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
