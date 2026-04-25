import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSeedState } from "./seed.mjs";

const DEFAULT_DB_PATH = path.resolve(
  process.cwd(),
  "mvp/server/data/mvp.sqlite",
);

export function createDatabase(
  providerMode = process.env.MVP_CALENDAR_PROVIDER ?? "mock",
) {
  const filename = path.resolve(process.env.MVP_DB_PATH ?? DEFAULT_DB_PATH);
  fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  initSchema(db);
  migrateSchema(db);
  seedDatabase(db, providerMode);
  normalizeLegacyData(db);

  return {
    db,
    filename,
    withTransaction(task) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = task();
        if (result && typeof result.then === "function") {
          return result
            .then((value) => {
              db.exec("COMMIT");
              return value;
            })
            .catch((error) => {
              safeRollback(db);
              throw error;
            });
        }

        db.exec("COMMIT");
        return result;
      } catch (error) {
        safeRollback(db);
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}

function safeRollback(db) {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Ignore nested rollback failures.
  }
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      connection_invite_token TEXT UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS callers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS booking_links (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      timezone TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      interval_minutes INTEGER NOT NULL,
      buffer_before_minutes INTEGER NOT NULL,
      buffer_after_minutes INTEGER NOT NULL,
      min_notice_minutes INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reps (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      seniority TEXT NOT NULL,
      timezone TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rep_calendar_connections (
      id TEXT PRIMARY KEY,
      rep_id TEXT NOT NULL UNIQUE REFERENCES reps(id),
      provider TEXT NOT NULL,
      provider_email TEXT,
      provider_grant_id TEXT,
      provider_account_id TEXT,
      booking_calendar_id TEXT,
      status TEXT NOT NULL,
      auth_url TEXT,
      last_sync_at TEXT,
      last_webhook_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS routing_policies (
      id TEXT PRIMARY KEY,
      booking_link_id TEXT NOT NULL UNIQUE REFERENCES booking_links(id),
      company_size_threshold INTEGER NOT NULL,
      senior_weight REAL NOT NULL,
      junior_weight REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      booking_link_id TEXT NOT NULL REFERENCES booking_links(id),
      client_id TEXT NOT NULL REFERENCES clients(id),
      caller_id TEXT NOT NULL REFERENCES callers(id),
      assigned_rep_id TEXT NOT NULL REFERENCES reps(id),
      company_name TEXT NOT NULL,
      company_size INTEGER NOT NULL,
      prospect_name TEXT NOT NULL,
      prospect_email TEXT NOT NULL,
      notes TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      timezone TEXT NOT NULL,
      status TEXT NOT NULL,
      schedule_state TEXT NOT NULL DEFAULT 'scheduled',
      outcome_state TEXT NOT NULL DEFAULT 'pending',
      original_start_at TEXT,
      previous_start_at TEXT,
      last_calendar_change_at TEXT,
      calendar_sync_state TEXT NOT NULL DEFAULT 'synced',
      cancelled_at TEXT,
      completed_at TEXT,
      no_show_at TEXT,
      external_event_id TEXT,
      assignment_reason_json TEXT NOT NULL,
      sync_state TEXT NOT NULL DEFAULT 'synced',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS booking_status_history (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_type TEXT NOT NULL DEFAULT 'admin',
      actor_label TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS booking_timeline_events (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      event_type TEXT NOT NULL,
      actor_label TEXT NOT NULL,
      reason TEXT,
      meta_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY,
      source_booking_id TEXT NOT NULL REFERENCES bookings(id),
      client_id TEXT NOT NULL REFERENCES clients(id),
      caller_id TEXT NOT NULL REFERENCES callers(id),
      type TEXT NOT NULL,
      trigger_reason TEXT NOT NULL,
      status TEXT NOT NULL,
      due_at TEXT NOT NULL,
      replacement_booking_id TEXT REFERENCES bookings(id),
      notes TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      dismissed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      rep_id TEXT NOT NULL REFERENCES reps(id),
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_type TEXT,
      external_id TEXT,
      payload_json TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_booking_links_slug ON booking_links(slug);
    CREATE INDEX IF NOT EXISTS idx_bookings_link_start ON bookings(booking_link_id, start_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_rep_start ON bookings(assigned_rep_id, start_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_external_event ON bookings(external_event_id);
    CREATE INDEX IF NOT EXISTS idx_history_booking ON booking_status_history(booking_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_timeline_booking ON booking_timeline_events(booking_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_status ON follow_up_tasks(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_booking ON follow_up_tasks(source_booking_id, status);
    CREATE INDEX IF NOT EXISTS idx_connections_status ON rep_calendar_connections(status);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_rep_time ON calendar_events(rep_id, start_at, end_at);
  `);
}

function migrateSchema(db) {
  ensureColumn(db, "clients", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "clients", "connection_invite_token", "TEXT UNIQUE");
  ensureColumn(db, "bookings", "schedule_state", "TEXT NOT NULL DEFAULT 'scheduled'");
  ensureColumn(db, "bookings", "outcome_state", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db, "bookings", "original_start_at", "TEXT");
  ensureColumn(db, "bookings", "previous_start_at", "TEXT");
  ensureColumn(db, "bookings", "last_calendar_change_at", "TEXT");
  ensureColumn(db, "bookings", "calendar_sync_state", "TEXT NOT NULL DEFAULT 'synced'");
  ensureColumn(db, "bookings", "cancelled_at", "TEXT");
  ensureColumn(db, "bookings", "completed_at", "TEXT");
  ensureColumn(db, "bookings", "no_show_at", "TEXT");

  const clientsMissingInviteToken = db
    .prepare("SELECT id FROM clients WHERE connection_invite_token IS NULL OR connection_invite_token = ''")
    .all();

  const updateInviteToken = db.prepare(`
    UPDATE clients
    SET connection_invite_token = ?
    WHERE id = ?
  `);

  clientsMissingInviteToken.forEach((client) => {
    updateInviteToken.run(`invite-${randomUUID()}`, client.id);
  });
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((entry) => entry.name === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedDatabase(db, providerMode) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM clients").get();
  if (existing.count > 0) {
    return;
  }

  const seed = createSeedState(providerMode);

  const insertClient = db.prepare(
    "INSERT INTO clients (id, name, timezone, connection_invite_token, active) VALUES (?, ?, ?, ?, ?)",
  );
  seed.clients.forEach((client) => {
    insertClient.run(
      client.id,
      client.name,
      client.timezone,
      client.connectionInviteToken,
      toDbBool(true),
    );
  });

  const insertCaller = db.prepare(
    "INSERT INTO callers (id, name, active) VALUES (?, ?, ?)",
  );
  seed.callers.forEach((caller) => {
    insertCaller.run(caller.id, caller.name, toDbBool(caller.active));
  });

  const insertLink = db.prepare(`
    INSERT INTO booking_links (
      id,
      client_id,
      slug,
      title,
      timezone,
      duration_minutes,
      interval_minutes,
      buffer_before_minutes,
      buffer_after_minutes,
      min_notice_minutes,
      active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  seed.bookingLinks.forEach((link) => {
    insertLink.run(
      link.id,
      link.clientId,
      link.slug,
      link.title,
      link.timezone,
      link.durationMinutes,
      link.intervalMinutes,
      link.bufferBeforeMinutes,
      link.bufferAfterMinutes,
      link.minNoticeMinutes,
      toDbBool(link.active),
    );
  });

  const insertRep = db.prepare(`
    INSERT INTO reps (
      id,
      client_id,
      name,
      email,
      seniority,
      timezone,
      active,
      sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  seed.reps.forEach((rep) => {
    insertRep.run(
      rep.id,
      rep.clientId,
      rep.name,
      rep.email,
      rep.seniority,
      rep.timezone,
      toDbBool(rep.active),
      rep.sortOrder,
    );
  });

  const insertConnection = db.prepare(`
    INSERT INTO rep_calendar_connections (
      id,
      rep_id,
      provider,
      provider_email,
      provider_grant_id,
      provider_account_id,
      booking_calendar_id,
      status,
      auth_url,
      last_sync_at,
      last_webhook_at,
      last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  seed.repCalendarConnections.forEach((connection) => {
    insertConnection.run(
      connection.id,
      connection.repId,
      connection.provider,
      connection.providerEmail,
      connection.nylasGrantId,
      connection.nylasAccountId,
      connection.bookingCalendarId,
      connection.status,
      connection.authUrl,
      connection.lastSyncAt,
      connection.lastWebhookAt,
      connection.lastError,
    );
  });

  const insertPolicy = db.prepare(`
    INSERT INTO routing_policies (
      id,
      booking_link_id,
      company_size_threshold,
      senior_weight,
      junior_weight
    ) VALUES (?, ?, ?, ?, ?)
  `);
  seed.routingPolicies.forEach((policy) => {
    insertPolicy.run(
      policy.id,
      policy.bookingLinkId,
      policy.companySizeThreshold,
      policy.seniorWeight,
      policy.juniorWeight,
    );
  });

  const insertBooking = db.prepare(`
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
      cancelled_at,
      completed_at,
      no_show_at,
      external_event_id,
      assignment_reason_json,
      sync_state,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  seed.bookings.forEach((booking) => {
    const normalized = normalizeLegacyStatus(booking.status);
    insertBooking.run(
      booking.id,
      booking.bookingLinkId,
      booking.clientId,
      booking.callerId,
      booking.assignedRepId,
      booking.companyName,
      booking.companySize,
      booking.prospectName,
      booking.prospectEmail,
      booking.notes ?? null,
      booking.startAt,
      booking.endAt,
      booking.timezone,
      booking.status,
      normalized.scheduleState,
      normalized.outcomeState,
      booking.startAt,
      null,
      null,
      "synced",
      normalized.scheduleState === "cancelled" ? booking.createdAt : null,
      normalized.outcomeState === "completed" ? booking.createdAt : null,
      normalized.outcomeState === "no_show" ? booking.createdAt : null,
      booking.externalEventId ?? null,
      JSON.stringify(booking.assignmentReason ?? {}),
      "synced",
      booking.createdAt,
    );
  });

  const insertHistory = db.prepare(`
    INSERT INTO booking_status_history (
      id,
      booking_id,
      from_status,
      to_status,
      actor_type,
      actor_label,
      reason,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  seed.bookingStatusHistory.forEach((entry) => {
    insertHistory.run(
      entry.id,
      entry.bookingId,
      entry.fromStatus ?? null,
      entry.toStatus,
      inferActorType(entry.actorLabel),
      entry.actorLabel,
      entry.reason ?? null,
      entry.createdAt,
    );
  });

  const insertCalendarEvent = db.prepare(`
    INSERT INTO calendar_events (id, title, rep_id, start_at, end_at, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  seed.calendarEvents.forEach((event) => {
    insertCalendarEvent.run(
      event.id,
      event.title,
      event.repId,
      event.startAt,
      event.endAt,
      event.source,
    );
  });
}

function normalizeLegacyData(db) {
  db.exec("UPDATE clients SET active = COALESCE(active, 1)");
  db.exec(`
    UPDATE bookings
    SET schedule_state = CASE status
          WHEN 'cancelled' THEN 'cancelled'
          WHEN 'rescheduled' THEN 'rescheduled'
          ELSE 'scheduled'
        END
  `);
  db.exec(`
    UPDATE bookings
    SET outcome_state = CASE status
          WHEN 'completed' THEN 'completed'
          WHEN 'no_show' THEN 'no_show'
          WHEN 'not_qualified' THEN 'not_qualified'
          ELSE 'pending'
        END
  `);
  db.exec("UPDATE bookings SET original_start_at = COALESCE(original_start_at, start_at)");
  db.exec("UPDATE bookings SET calendar_sync_state = COALESCE(calendar_sync_state, sync_state, 'synced')");
  db.exec("UPDATE bookings SET status = COALESCE(status, 'booked')");
  db.exec(`
    UPDATE bookings
    SET completed_at = COALESCE(completed_at, CASE WHEN outcome_state = 'completed' THEN created_at END),
        no_show_at = COALESCE(no_show_at, CASE WHEN outcome_state = 'no_show' THEN created_at END),
        cancelled_at = COALESCE(cancelled_at, CASE WHEN schedule_state = 'cancelled' THEN created_at END)
  `);
  db.exec(`
    UPDATE booking_links
    SET buffer_before_minutes = 0,
        buffer_after_minutes = 0
    WHERE buffer_before_minutes != 0 OR buffer_after_minutes != 0
  `);
}

function toDbBool(value) {
  return value ? 1 : 0;
}

function inferActorType(actorLabel) {
  if (actorLabel.toLowerCase().includes("caller")) {
    return "caller";
  }
  if (actorLabel.toLowerCase().includes("admin")) {
    return "admin";
  }
  return "system";
}

function normalizeLegacyStatus(status) {
  switch (status) {
    case "completed":
      return { scheduleState: "scheduled", outcomeState: "completed" };
    case "no_show":
      return { scheduleState: "scheduled", outcomeState: "no_show" };
    case "cancelled":
      return { scheduleState: "cancelled", outcomeState: "pending" };
    case "rescheduled":
      return { scheduleState: "rescheduled", outcomeState: "pending" };
    case "not_qualified":
      return { scheduleState: "scheduled", outcomeState: "not_qualified" };
    default:
      return { scheduleState: "scheduled", outcomeState: "pending" };
  }
}
