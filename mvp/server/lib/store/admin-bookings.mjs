import {
  addDays,
  endOfDay,
  endOfWeek,
  parseISO,
  startOfToday,
  startOfWeek,
} from "date-fns";
import { parseJson } from "../utils.mjs";

export function listAdminBookings(store, provider, filters = {}) {
  const bookings = store.filterBookings(store.listAllBookings(), filters);
  const counts = blankStatusCounts();
  bookings.forEach((booking) => {
    counts[store.getDisplayStatus(booking)] += 1;
  });

  const allReps = store.listAllReps().map((rep) => store.decorateRep(rep));
  const tasks = store.filterTasks(store.listAllTasks(), filters);

  return {
    timezone: "Europe/Paris",
    counts,
    openTaskCount: tasks.filter((task) => task.status === "open").length,
    clientStats: store.getClientStats(bookings, tasks),
    bookings: bookings.map((booking) => store.toBookingSummary(booking)),
    filters: {
      clients: store.listAllClients().map((client) => ({
        id: client.id,
        name: client.name,
        connectionInviteToken: client.connectionInviteToken,
      })),
      callers: store.listAllCallers().map((caller) => ({
        id: caller.id,
        name: caller.name,
      })),
      reps: allReps.map((rep) => ({
        id: rep.id,
        clientId: rep.clientId,
        name: rep.name,
        clientName: store.getClient(rep.clientId)?.name ?? "Client inconnu",
        businessEmail: rep.businessEmail,
        seniority: rep.seniority,
        connectionStatus: rep.connectionStatus,
        provider: rep.provider,
        providerEmail: rep.providerEmail,
        connectedAt: rep.connectedAt,
        lastSyncAt: rep.lastSyncAt,
        lastWebhookAt: rep.lastWebhookAt,
        lastError: rep.lastError,
      })),
      statuses: store.displayStatuses,
    },
    integrations: provider.getOverview(),
  };
}

export function listAdminCalendar(store, filters = {}) {
  const from = filters.from ?? startOfToday().toISOString();
  const to = filters.to ?? endOfDay(addDays(startOfToday(), 6)).toISOString();
  const entries = store.filterBookings(store.listAllBookings(), {
    ...filters,
    from,
    to,
  }).map((booking) => store.toBookingSummary(booking));

  return {
    timezone: "Europe/Paris",
    from,
    to,
    entries,
  };
}

export function listAdminTasks(store, filters = {}) {
  return {
    timezone: "Europe/Paris",
    tasks: store.filterTasks(store.listAllTasks(), filters),
  };
}

export function getBookingDetail(store, bookingId) {
  const booking = store.getBooking(bookingId);
  if (!booking) {
    throw new Error("Booking introuvable.");
  }

  const caller = store.getCaller(booking.callerId);
  const rep = store.getRep(booking.assignedRepId);
  const client = store.getClient(booking.clientId);
  const linkedTask =
    store.getOpenTaskByBookingId(booking.id) ?? store.getTaskByReplacement(booking.id);

  return {
    booking: {
      id: booking.id,
      displayStatus: store.getDisplayStatus(booking),
      scheduleState: booking.scheduleState,
      outcomeState: booking.outcomeState,
      prospectRsvpState: booking.prospectRsvpState,
      clientId: booking.clientId,
      clientName: client?.name ?? "Client inconnu",
      companyName: booking.companyName,
      companySize: booking.companySize,
      prospectName: booking.prospectName,
      prospectEmail: booking.prospectEmail,
      callerName: caller?.name ?? "Caller inconnu",
      callerId: booking.callerId,
      assignedRepName: rep?.name ?? "Rep inconnu",
      assignedRepId: booking.assignedRepId,
      notes: booking.notes,
      startAt: booking.startAt,
      endAt: booking.endAt,
      originalStartAt: booking.originalStartAt,
      previousStartAt: booking.previousStartAt,
      lastCalendarChangeAt: booking.lastCalendarChangeAt,
      calendarSyncState: booking.calendarSyncState,
      timezone: booking.timezone,
      assignmentReason: {
        ...booking.assignmentReason,
        candidateRepNames: (booking.assignmentReason?.candidateRepIds ?? []).map(
          (repId) => store.getRep(repId)?.name ?? repId,
        ),
      },
      externalEventId: booking.externalEventId ?? "",
      linkedTask,
    },
    timeline: store.getTimelineForBooking(bookingId),
  };
}

export async function listBookingRescheduleAvailability(
  store,
  bookingId,
  filters = {},
  { weekStartsOn },
) {
  const booking = store.getBooking(bookingId);
  if (!booking) {
    throw new Error("Booking introuvable.");
  }

  const bookingLink = store.getBookingLinkById(booking.bookingLinkId);
  if (!bookingLink) {
    throw new Error("Booking link introuvable.");
  }

  const fallbackWeekStart = startOfWeek(parseISO(booking.startAt), {
    weekStartsOn,
  });

  return store.buildAvailability(
    bookingLink,
    booking.companySize,
    {
      from: filters.from ?? fallbackWeekStart.toISOString(),
      to:
        filters.to ??
        endOfWeek(fallbackWeekStart, {
          weekStartsOn,
        }).toISOString(),
    },
    {
      excludedBookingId: booking.id,
      includeRepDetails: true,
    },
  );
}

export function getTimelineForBooking(db, bookingId) {
  return db
    .prepare(`
      SELECT *
      FROM booking_timeline_events
      WHERE booking_id = ?
      ORDER BY created_at DESC
    `)
    .all(bookingId)
    .map((entry) => ({
      id: entry.id,
      type: entry.event_type,
      actorLabel: entry.actor_label,
      reason: entry.reason ?? "",
      createdAt: entry.created_at,
      meta: parseJson(entry.meta_json),
    }));
}

export function toBookingSummary(store, booking, activeScheduleStates, providerMode) {
  const cancelMode = getCallerCancelMode(
    store,
    booking,
    activeScheduleStates,
    providerMode,
  );

  return {
    id: booking.id,
    displayStatus: store.getDisplayStatus(booking),
    scheduleState: booking.scheduleState,
    outcomeState: booking.outcomeState,
    clientId: booking.clientId,
    clientName: store.getClient(booking.clientId)?.name ?? "Client inconnu",
    companyName: booking.companyName,
    companySize: booking.companySize,
    prospectName: booking.prospectName,
    prospectEmail: booking.prospectEmail,
    callerId: booking.callerId,
    callerName: store.getCaller(booking.callerId)?.name ?? "Caller inconnu",
    assignedRepId: booking.assignedRepId,
    assignedRepName: store.getRep(booking.assignedRepId)?.name ?? "Rep inconnu",
    startAt: booking.startAt,
    endAt: booking.endAt,
    originalStartAt: booking.originalStartAt,
    previousStartAt: booking.previousStartAt,
    timezone: booking.timezone,
    notes: booking.notes,
    taskId: store.getOpenTaskByBookingId(booking.id)?.id ?? null,
    canCancel: cancelMode === "direct",
    cancelMode,
  };
}

export function getCallerCancelMode(store, booking, activeScheduleStates, providerMode) {
  if (
    !activeScheduleStates.has(booking.scheduleState) ||
    booking.outcomeState !== "pending"
  ) {
    return null;
  }

  if (parseISO(booking.startAt) <= new Date()) {
    return null;
  }

  if (providerMode !== "nylas") {
    return "direct";
  }

  const connection = store.getConnection(booking.assignedRepId);
  if (!connection || connection.status !== "connected") {
    return "admin_only";
  }

  return "direct";
}

export function getClientStats(store, bookings, tasks) {
  const byClient = new Map();
  bookings.forEach((booking) => {
    if (!byClient.has(booking.clientId)) {
      const client = store.getClient(booking.clientId);
      byClient.set(booking.clientId, {
        clientId: booking.clientId,
        clientName: client?.name ?? "Client inconnu",
        total: 0,
        byStatus: blankStatusCounts(),
        openTaskCount: 0,
      });
    }
    const entry = byClient.get(booking.clientId);
    entry.total += 1;
    entry.byStatus[store.getDisplayStatus(booking)] += 1;
  });

  tasks.forEach((task) => {
    if (!byClient.has(task.clientId)) {
      const client = store.getClient(task.clientId);
      byClient.set(task.clientId, {
        clientId: task.clientId,
        clientName: client?.name ?? "Client inconnu",
        total: 0,
        byStatus: blankStatusCounts(),
        openTaskCount: 0,
      });
    }
    if (task.status === "open") {
      byClient.get(task.clientId).openTaskCount += 1;
    }
  });

  return Array.from(byClient.values()).map((entry) => ({
    clientId: entry.clientId,
    clientName: entry.clientName,
    total: entry.total,
    byStatus: entry.byStatus,
    completedPct:
      entry.total > 0
        ? Math.round((entry.byStatus.completed / entry.total) * 100)
        : 0,
    noShowPct:
      entry.total > 0
        ? Math.round((entry.byStatus.no_show / entry.total) * 100)
        : 0,
    toReplacePct:
      entry.total > 0
        ? Math.round(
            ((entry.byStatus.no_show + entry.byStatus.cancelled) / entry.total) * 100,
          )
        : 0,
    pendingCount: entry.byStatus.scheduled + entry.byStatus.rescheduled,
    openTaskCount: entry.openTaskCount,
  }));
}

export function filterBookings(store, bookings, filters = {}) {
  return bookings.filter((booking) => {
    if (filters.status && filters.status !== "all") {
      if (store.getDisplayStatus(booking) !== filters.status) {
        return false;
      }
    }
    if (filters.callerId && filters.callerId !== "all") {
      if (booking.callerId !== filters.callerId) {
        return false;
      }
    }
    if (filters.repId && filters.repId !== "all") {
      if (booking.assignedRepId !== filters.repId) {
        return false;
      }
    }
    if (filters.clientId && filters.clientId !== "all") {
      if (booking.clientId !== filters.clientId) {
        return false;
      }
    }
    if (filters.from && booking.startAt < filters.from) {
      return false;
    }
    if (filters.to && booking.startAt > filters.to) {
      return false;
    }
    if (filters.query) {
      const clientName = store.getClient(booking.clientId)?.name ?? "";
      const callerName = store.getCaller(booking.callerId)?.name ?? "";
      const repName = store.getRep(booking.assignedRepId)?.name ?? "";
      if (
        !matchesQuery(filters.query, [
          booking.companyName,
          booking.prospectName,
          clientName,
          callerName,
          repName,
        ])
      ) {
        return false;
      }
    }
    return true;
  });
}

export function filterTasks(tasks, filters = {}) {
  return tasks.filter((task) => {
    if (filters.callerId && filters.callerId !== "all" && task.callerId !== filters.callerId) {
      return false;
    }
    if (filters.clientId && filters.clientId !== "all" && task.clientId !== filters.clientId) {
      return false;
    }
    if (filters.query) {
      if (
        !matchesQuery(filters.query, [
          task.clientName,
          task.callerName,
          task.companyName,
          task.prospectName,
        ])
      ) {
        return false;
      }
    }
    return true;
  });
}

function matchesQuery(query, fields) {
  const normalizedQuery = query.trim().toLowerCase();
  return fields.some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
}

function blankStatusCounts() {
  return {
    scheduled: 0,
    completed: 0,
    no_show: 0,
    cancelled: 0,
    rescheduled: 0,
    not_qualified: 0,
  };
}
