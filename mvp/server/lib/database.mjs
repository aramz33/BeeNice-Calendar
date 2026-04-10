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
  seedDatabase(db, providerMode);

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
      timezone TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_history_booking ON booking_status_history(booking_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_connections_status ON rep_calendar_connections(status);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_rep_time ON calendar_events(rep_id, start_at, end_at);
  `);
}

function seedDatabase(db, providerMode) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM clients").get();
  if (existing.count > 0) {
    return;
  }

  const seed = createSeedState(providerMode);

  const insertClient = db.prepare(
    "INSERT INTO clients (id, name, timezone) VALUES (?, ?, ?)",
  );
  seed.clients.forEach((client) => {
    insertClient.run(client.id, client.name, client.timezone);
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
      external_event_id,
      assignment_reason_json,
      sync_state,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  seed.bookings.forEach((booking) => {
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
