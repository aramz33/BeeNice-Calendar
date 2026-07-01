import { makeId, nextBusinessMorning } from "./utils.mjs";

export function fromTaskRow(row) {
  return {
    id: row.id,
    sourceBookingId: row.source_booking_id,
    clientId: row.client_id,
    clientName: row.client_name,
    callerId: row.caller_id,
    callerName: row.caller_name,
    type: row.type,
    triggerReason: row.trigger_reason,
    status: row.status,
    dueAt: row.due_at,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
    dismissedAt: row.dismissed_at ?? null,
    replacementBookingId: row.replacement_booking_id ?? null,
    companyName: row.company_name,
    prospectName: row.prospect_name,
    prospectEmail: row.prospect_email,
    notes: row.notes ?? null,
    sourceStartAt: row.start_at,
  };
}

function taskBaseQuery(db, whereClause = "") {
  return db.prepare(`
    SELECT t.*, b.company_name, b.prospect_name, b.prospect_email, b.start_at, c.name AS client_name, u.name AS caller_name
    FROM follow_up_tasks t
    JOIN bookings b ON b.id = t.source_booking_id
    JOIN clients c ON c.id = t.client_id
    JOIN callers u ON u.id = t.caller_id
    ${whereClause}
  `);
}

export function listAllTasks(db) {
  return taskBaseQuery(db, "ORDER BY t.due_at ASC, t.created_at DESC")
    .all()
    .map(fromTaskRow);
}

export function getTask(db, taskId) {
  const row = taskBaseQuery(db, "WHERE t.id = ?").get(taskId);
  return row ? fromTaskRow(row) : null;
}

export function getOpenTaskByBookingId(db, bookingId) {
  const row = taskBaseQuery(db, "WHERE t.source_booking_id = ? AND t.status = 'open'").get(bookingId);
  return row ? fromTaskRow(row) : null;
}

export function getTaskByReplacement(db, bookingId) {
  const row = taskBaseQuery(db, "WHERE t.replacement_booking_id = ?").get(bookingId);
  return row ? fromTaskRow(row) : null;
}

export function listCallerTasks(db, callerId, clientId = null) {
  const tasks = listAllTasks(db).filter(
    (task) =>
      task.callerId === callerId &&
      task.status === "open" &&
      (!clientId || task.clientId === clientId),
  );

  return {
    timezone: "Europe/Paris",
    tasks: tasks.sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
  };
}

export function ensureFollowUpTask(db, store, bookingId, triggerReason, createdAt = new Date().toISOString()) {
  const current = getOpenTaskByBookingId(db, bookingId);
  if (current) {
    return current;
  }

  const booking = store.getBooking(bookingId);
  if (!booking) {
    return null;
  }

  const taskId = makeId("task");
  db.prepare(`
    INSERT INTO follow_up_tasks (
      id,
      source_booking_id,
      client_id,
      caller_id,
      type,
      trigger_reason,
      status,
      due_at,
      replacement_booking_id,
      notes,
      created_at,
      completed_at,
      dismissed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    booking.id,
    booking.clientId,
    booking.callerId,
    "reposition_booking",
    triggerReason,
    "open",
    nextBusinessMorning(createdAt),
    null,
    booking.notes || null,
    createdAt,
    null,
    null,
  );

  store.insertTimelineEvent({
    bookingId,
    type: "task_created",
    actorLabel: "BeeNice",
    reason:
      triggerReason === "cancelled"
        ? "Tâche de repositionnement créée après annulation."
        : "Tâche de repositionnement créée après no-show.",
    createdAt,
    meta: { triggerReason, taskId },
  });

  return getTask(db, taskId);
}

export function completeTask(db, store, taskId, replacementBookingId, createdAt = new Date().toISOString()) {
  const task = getTask(db, taskId);
  if (!task) {
    return null;
  }

  db.prepare(`
    UPDATE follow_up_tasks
    SET status = 'done',
        replacement_booking_id = ?,
        completed_at = ?
    WHERE id = ?
  `).run(replacementBookingId, createdAt, taskId);

  store.insertTimelineEvent({
    bookingId: task.sourceBookingId,
    type: "task_completed",
    actorLabel: store.getCaller(task.callerId)?.name ?? "BeeNice",
    reason: "Tâche de repositionnement clôturée après rebooking.",
    createdAt,
    meta: { taskId, replacementBookingId },
  });

  return getTask(db, taskId);
}

export function updateTask(database, db, store, taskId, payload = {}) {
  const task = getTask(db, taskId);
  if (!task) {
    throw new Error("Tâche introuvable.");
  }

  const createdAt = new Date().toISOString();
  const nextStatus = payload.status ?? task.status;
  const dueAt = payload.dueAt ?? task.dueAt;
  if (!["open", "done", "dismissed"].includes(nextStatus)) {
    throw new Error("Statut de tâche invalide.");
  }

  let nextCallerId = task.callerId;
  if (payload.assignedCallerId !== undefined) {
    const caller = store.getCaller(payload.assignedCallerId);
    if (!caller || !caller.active) throw new Error("Colleur introuvable.");
    nextCallerId = caller.id;
  }

  database.withTransaction(() => {
    db.prepare(`
      UPDATE follow_up_tasks
      SET status = ?,
          due_at = ?,
          notes = ?,
          completed_at = ?,
          dismissed_at = ?,
          caller_id = ?
      WHERE id = ?
    `).run(
      nextStatus,
      dueAt,
      payload.notes ?? task.notes ?? null,
      nextStatus === "done" ? createdAt : task.completedAt,
      nextStatus === "dismissed" ? createdAt : task.dismissedAt,
      nextCallerId,
      taskId,
    );

    if (nextStatus !== task.status) {
      store.insertTimelineEvent({
        bookingId: task.sourceBookingId,
        type: "task_completed",
        actorLabel: "Admin BeeNice",
        reason:
          nextStatus === "dismissed"
            ? "Tâche classée."
            : "Tâche marquée comme traitée.",
        createdAt,
        meta: { taskStatus: nextStatus },
      });
    }
  });

  store.broadcastAdmin("task.updated");
  return { ok: true };
}
