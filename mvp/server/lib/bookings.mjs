import {addMinutes, parseISO} from "date-fns";
import {makeId} from "./utils.mjs";

export const OUTCOME_STATES = [
  "pending",
  "completed",
  "no_show",
  "not_qualified",
];

export const SCHEDULE_STATES = ["scheduled", "rescheduled", "cancelled"];

export function getDisplayStatus(booking) {
  if (booking.scheduleState === "cancelled") {
    return "cancelled";
  }
  if (booking.outcomeState === "completed") {
    return "completed";
  }
  if (booking.outcomeState === "no_show") {
    return "no_show";
  }
  if (booking.outcomeState === "not_qualified") {
    return "not_qualified";
  }
  if (booking.scheduleState === "rescheduled") {
    return "rescheduled";
  }
  return "scheduled";
}

export function getLegacyStatus(booking) {
  const displayStatus = getDisplayStatus(booking);
  switch (displayStatus) {
    case "scheduled":
      return "booked";
    default:
      return displayStatus;
  }
}

export async function createBooking(database, db, store, provider, slug, payload) {
  const bookingLink = store.getBookingLinkBySlug(slug);
  if (!bookingLink) {
    throw new Error("Booking link introuvable.");
  }

  const caller = store.getCaller(payload.callerId);
  if (!caller || !caller.active) {
    throw new Error("Caller introuvable.");
  }

  if (
    !payload.prospectName ||
    !payload.prospectEmail ||
    !payload.companyName ||
    !payload.slotStart
  ) {
    throw new Error("Informations booking incomplètes.");
  }

  const companySize = Number(payload.companySize);
  if (Number.isNaN(companySize)) {
    throw new Error("La taille de société est obligatoire.");
  }

  const slotStart = parseISO(payload.slotStart);
  if (Number.isNaN(slotStart.getTime())) {
    throw new Error("Créneau invalide.");
  }

  const sourceTask = payload.sourceTaskId
    ? store.getTask(payload.sourceTaskId)
    : null;
  if (sourceTask && sourceTask.callerId !== caller.id) {
    throw new Error("La tâche ne correspond pas au caller sélectionné.");
  }

  const createdAt = new Date().toISOString();
  const bookingId = makeId("booking");
  let externalEventId = null;
  let repForCleanup = null;

  try {
    const result = await database.withTransaction(async () => {
      const freshLink = store.getBookingLinkBySlug(slug);
      if (!freshLink) {
        throw new Error("Booking link introuvable.");
      }

        const assignment = await store.assignRepForSlot(
        freshLink,
        companySize,
        slotStart,
      );

      const booking = {
        id: bookingId,
        bookingLinkId: freshLink.id,
        clientId: freshLink.clientId,
        callerId: caller.id,
        assignedRepId: assignment.rep.id,
        companyName: payload.companyName,
        companySize,
        prospectName: payload.prospectName,
        prospectEmail: payload.prospectEmail,
        notes: payload.notes ?? "",
        startAt: slotStart.toISOString(),
        endAt: addMinutes(slotStart, freshLink.durationMinutes).toISOString(),
        timezone: freshLink.timezone,
        status: "booked",
        scheduleState: "scheduled",
        outcomeState: "pending",
        originalStartAt: slotStart.toISOString(),
        previousStartAt: null,
        lastCalendarChangeAt: null,
        calendarSyncState: "synced",
        externalEventId: null,
        assignmentReason: assignment.reason,
        createdAt,
        syncState: "pending",
      };

      repForCleanup = assignment.rep;
      externalEventId = await provider.createExternalEvent(store, assignment.rep, booking);

      db.prepare(`
        INSERT INTO bookings (
          id,
          booking_link_id,
          client_id,
          caller_id,
          assigned_rep_id,
          company_name,
          company_size,
          prospect_name,
          prospect_email,
          notes,
          start_at,
          end_at,
          timezone,
          status,
          schedule_state,
          outcome_state,
          original_start_at,
          previous_start_at,
          last_calendar_change_at,
          calendar_sync_state,
          external_event_id,
          assignment_reason_json,
          sync_state,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        booking.id,
        booking.bookingLinkId,
        booking.clientId,
        booking.callerId,
        booking.assignedRepId,
        booking.companyName,
        booking.companySize,
        booking.prospectName,
        booking.prospectEmail,
        booking.notes || null,
        booking.startAt,
        booking.endAt,
        booking.timezone,
        "booked",
        booking.scheduleState,
        booking.outcomeState,
        booking.originalStartAt,
        null,
        null,
        booking.calendarSyncState,
        externalEventId,
        JSON.stringify(booking.assignmentReason),
        "synced",
        booking.createdAt,
      );

      store.insertLegacyStatusHistory({
        bookingId: booking.id,
        fromStatus: null,
        toStatus: "booked",
        actorType: "caller",
        actorLabel: caller.name,
        reason: "Booking créé depuis le workspace caller.",
        createdAt,
      });

      store.insertTimelineEvent({
        bookingId: booking.id,
        type: "booking_created",
        actorLabel: caller.name,
        reason: "Booking créé depuis le workspace caller.",
        createdAt,
      });

      if (sourceTask) {
        store.completeTask(sourceTask.id, booking.id, createdAt);
      }

      return {
        bookingId: booking.id,
        assignedRepName: assignment.rep.name,
        slug: freshLink.slug,
        clientId: freshLink.clientId,
      };
    });

    store.broadcastAvailability(result.slug);
    store.broadcastAdmin("booking.updated");
    store.broadcastAdmin("task.updated");
    return {
      bookingId: result.bookingId,
      assignedRepName: result.assignedRepName,
    };
  } catch (error) {
    if (externalEventId && repForCleanup) {
      try {
        await provider.releaseExternalEvent(store, {
          assignedRepId: repForCleanup.id,
          externalEventId,
        });
      } catch {
        // Best effort cleanup only.
      }
    }
    throw error;
  }
}

export async function updateBookingOutcome(database, db, store, provider, bookingId, outcomeState, reason = "") {
  if (!OUTCOME_STATES.includes(outcomeState)) {
    throw new Error("Outcome invalide.");
  }

  const booking = store.getBooking(bookingId);
  if (!booking) {
    throw new Error("Booking introuvable.");
  }

  if (booking.outcomeState === outcomeState) {
    throw new Error("Le booking a déjà ce résultat.");
  }

  const createdAt = new Date().toISOString();
  const next = {
    ...booking,
    outcomeState,
  };

  database.withTransaction(() => {
    db.prepare(`
      UPDATE bookings
      SET outcome_state = ?,
          status = ?,
          completed_at = ?,
          no_show_at = ?
      WHERE id = ?
    `).run(
      outcomeState,
      getLegacyStatus(next),
      outcomeState === "completed" ? createdAt : booking.completedAt,
      outcomeState === "no_show" ? createdAt : booking.noShowAt,
      bookingId,
    );

    store.insertLegacyStatusHistory({
      bookingId,
      fromStatus: getLegacyStatus(booking),
      toStatus: getLegacyStatus(next),
      actorType: "admin",
      actorLabel: "Admin BeeNice",
      reason,
      createdAt,
    });

    store.insertTimelineEvent({
      bookingId,
      type: "outcome_set",
      actorLabel: "Admin BeeNice",
      reason: reason || `Résultat mis à jour: ${outcomeState}.`,
      createdAt,
      meta: { outcomeState },
    });

    if (outcomeState === "no_show") {
      store.ensureFollowUpTask(bookingId, "no_show", createdAt);
    }
  });

  store.broadcastAdmin("booking.updated");
  store.broadcastAdmin("task.updated");
  return { ok: true };
}

export async function updateBookingSchedule(database, db, store, provider, bookingId, scheduleState, reason = "", nextStartAt = null) {
  if (!SCHEDULE_STATES.includes(scheduleState)) {
    throw new Error("Statut calendrier invalide.");
  }

  const booking = store.getBooking(bookingId);
  if (!booking) {
    throw new Error("Booking introuvable.");
  }

  const createdAt = new Date().toISOString();
  const patch = {
    scheduleState,
    status: booking.status,
    previousStartAt: booking.previousStartAt,
    startAt: booking.startAt,
    endAt: booking.endAt,
    cancelledAt: booking.cancelledAt,
    lastCalendarChangeAt: createdAt,
  };

  if (scheduleState === "cancelled") {
    patch.cancelledAt = createdAt;
  }

  let assignment = null;
  let externalEventId = booking.externalEventId;
  if (scheduleState === "rescheduled") {
    if (!nextStartAt) {
      throw new Error("Nouvelle date obligatoire.");
    }

    const bookingLink = store.getBookingLinkById(booking.bookingLinkId);
    if (!bookingLink) {
      throw new Error("Booking link introuvable.");
    }

    const nextStart = parseISO(nextStartAt);
    if (Number.isNaN(nextStart.getTime())) {
      throw new Error("Nouvelle date invalide.");
    }

      assignment = await store.assignRepForSlot(
      bookingLink,
      booking.companySize,
      nextStart,
      {
        excludedBookingId: booking.id,
      },
    );

    patch.previousStartAt = booking.startAt;
    patch.startAt = nextStart.toISOString();
    patch.endAt = addMinutes(nextStart, bookingLink.durationMinutes).toISOString();
  }

  const nextBooking = {
    ...booking,
    scheduleState,
    assignedRepId: assignment?.rep.id ?? booking.assignedRepId,
    previousStartAt: patch.previousStartAt,
    startAt: patch.startAt,
    endAt: patch.endAt,
    assignmentReason: assignment?.reason ?? booking.assignmentReason,
  };

  if (scheduleState === "cancelled") {
    await provider.releaseExternalEvent(store, booking);
  }

  if (scheduleState === "rescheduled" && assignment) {
    externalEventId = await store.replaceExternalEventForReschedule(
      booking,
      nextBooking,
      assignment.rep,
    );
  }

  database.withTransaction(() => {
    db.prepare(`
      UPDATE bookings
      SET schedule_state = ?,
          status = ?,
          assigned_rep_id = ?,
          previous_start_at = ?,
          start_at = ?,
          end_at = ?,
          cancelled_at = ?,
          last_calendar_change_at = ?,
          calendar_sync_state = 'synced',
          external_event_id = ?,
          assignment_reason_json = ?
      WHERE id = ?
    `).run(
      scheduleState,
      getLegacyStatus(nextBooking),
      nextBooking.assignedRepId,
      patch.previousStartAt,
      patch.startAt,
      patch.endAt,
      patch.cancelledAt,
      patch.lastCalendarChangeAt,
      scheduleState === "cancelled" ? null : externalEventId,
      JSON.stringify(nextBooking.assignmentReason),
      bookingId,
    );

    store.insertLegacyStatusHistory({
      bookingId,
      fromStatus: getLegacyStatus(booking),
      toStatus: getLegacyStatus(nextBooking),
      actorType: "admin",
      actorLabel: "Admin BeeNice",
      reason,
      createdAt,
    });

    store.insertTimelineEvent({
      bookingId,
      type: "schedule_set",
      actorLabel: "Admin BeeNice",
      reason: reason || `Statut mis à jour: ${scheduleState}.`,
      createdAt,
      meta: {
        scheduleState,
        nextStartAt: scheduleState === "rescheduled" ? patch.startAt : undefined,
        assignedRepId: assignment?.rep.id,
      },
    });

    if (scheduleState === "cancelled") {
      store.ensureFollowUpTask(bookingId, "cancelled", createdAt);
    }
  });

  store.broadcastAvailability(store.getBookingLinkById(booking.bookingLinkId)?.slug);
  store.broadcastAdmin("booking.updated");
  store.broadcastAdmin("task.updated");
  return { ok: true };
}

export async function cancelCallerBooking(database, db, store, provider, slug, callerId, bookingId) {
  const bookingLink = store.getBookingLinkBySlug(slug);
  if (!bookingLink) {
    throw new Error("Booking link introuvable.");
  }

  const caller = store.getCaller(callerId);
  if (!caller || !caller.active) {
    throw new Error("Caller introuvable.");
  }

  const booking = store.getBooking(bookingId);
  if (!booking || booking.bookingLinkId !== bookingLink.id || booking.callerId !== callerId) {
    throw new Error("Booking introuvable pour ce caller.");
  }

  const cancelMode = store.getCallerCancelMode(booking);
  if (cancelMode !== "direct") {
    throw new Error("Annulation directe indisponible. Utilisez la console admin.");
  }

  await provider.releaseExternalEvent(store, booking);

  const createdAt = new Date().toISOString();
  database.withTransaction(() => {
    db.prepare(`
      UPDATE bookings
      SET schedule_state = 'cancelled',
          status = 'cancelled',
          cancelled_at = ?,
          last_calendar_change_at = ?,
          calendar_sync_state = 'synced'
    WHERE id = ?
    `).run(createdAt, createdAt, booking.id);

    store.insertLegacyStatusHistory({
      bookingId: booking.id,
      fromStatus: getLegacyStatus(booking),
      toStatus: "cancelled",
      actorType: "caller",
      actorLabel: caller.name,
      reason: "Annulation manuelle par le caller.",
      createdAt,
    });

    store.insertTimelineEvent({
      bookingId: booking.id,
      type: "schedule_set",
      actorLabel: caller.name,
      reason: "Annulation manuelle par le caller.",
      createdAt,
      meta: { scheduleState: "cancelled" },
    });
  });

  store.broadcastAvailability(slug);
  store.broadcastAdmin("booking.updated");
  store.broadcastAdmin("task.updated");
  return { ok: true };
}
