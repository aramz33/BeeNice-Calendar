import { randomUUID } from "node:crypto";
import { createDatabase } from "./database.mjs";
import {
  makeId,
  parseJson,
} from "./utils.mjs";
import {
  listAllTasks as listAllTasksFn,
  getTask as getTaskFn,
  getOpenTaskByBookingId as getOpenTaskByBookingIdFn,
  getTaskByReplacement as getTaskByReplacementFn,
  listCallerTasks as listCallerTasksFn,
  ensureFollowUpTask as ensureFollowUpTaskFn,
  completeTask as completeTaskFn,
  updateTask as updateTaskFn,
} from "./tasks.mjs";
import {
  REP_ROLES,
  isConnectionUsable,
  getEffectiveConnectionStatus,
  getConnection,
  findConflictingConnections,
  upsertConnection,
  disconnectConnection,
  claimCalendarConnection,
  startRepConnection as startRepConnectionFn,
  finalizeRepConnection as finalizeRepConnectionFn,
  getPublicRepConnectionPayload as getPublicRepConnectionPayloadFn,
  startPublicRepConnection as startPublicRepConnectionFn,
} from "./connections.mjs";
import {
  getEligibleReps as getEligibleRepsFn,
  getBusyIntervals as getBusyIntervalsFn,
  getBusyIntervalsForReps as getBusyIntervalsForRepsFn,
  getAvailableEligibleRepsForSlot as getAvailableEligibleRepsForSlotFn,
  assignRep as assignRepFn,
  getRollingCounts as getRollingCountsFn,
  getRepRollingLoad as getRepRollingLoadFn,
  isRepAvailableAgainstIntervals,
} from "./availability.mjs";
import {
  createBooking as createBookingFn,
  updateBookingOutcome as updateBookingOutcomeFn,
  updateBookingSchedule as updateBookingScheduleFn,
  cancelCallerBooking as cancelCallerBookingFn,
  getDisplayStatus,
  getLegacyStatus,
} from "./bookings.mjs";
import {
  buildAvailability as buildAvailabilityView,
  getPublicBookingPayload as getPublicBookingPayloadView,
  listCallerBookings as listCallerBookingsView,
} from "./store/public-booking.mjs";
import {
  filterBookings as filterAdminBookings,
  filterTasks as filterAdminTasks,
  getBookingDetail as getAdminBookingDetail,
  getCallerCancelMode as getCallerCancelModeView,
  getClientStats as getAdminClientStats,
  getTimelineForBooking as getBookingTimeline,
  listAdminBookings as listAdminBookingsView,
  listAdminCalendar as listAdminCalendarView,
  listAdminTasks as listAdminTasksView,
  listBookingRescheduleAvailability as listBookingRescheduleAvailabilityView,
  toBookingSummary as toBookingSummaryView,
} from "./store/admin-bookings.mjs";

const DISPLAY_STATUSES = [
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
  "rescheduled",
  "not_qualified",
];

const ROUTING_MODES = ["pool_unique", "weighted_seniority"];

const ACTIVE_SCHEDULE_STATES = new Set(["scheduled", "rescheduled"]);
const BOOKING_WINDOW_WEEKS = 12;
const WEEK_STARTS_ON = 1;
const DEFAULT_WORKSPACE_DURATION_MINUTES = 30;
const DEFAULT_WORKSPACE_INTERVAL_MINUTES = 30;
const DEFAULT_WORKSPACE_MIN_NOTICE_MINUTES = 60;
const DEFAULT_COMPANY_SIZE_THRESHOLD = 200;
const DEFAULT_SENIOR_WEIGHT = 0.8;
const DEFAULT_JUNIOR_WEIGHT = 0.2;

export function createStore(provider) {
  const database = createDatabase(provider.mode);
  const { db } = database;
  database.withTransaction(() => {
    ensureDefaultClientArtifacts(db);
  });
  const sseClients = new Map();
  const adminSseClients = new Set();

  const store = {
    displayStatuses: DISPLAY_STATUSES,
    dbFile: database.filename,
    getDisplayStatus,
    close() {
      database.close();
    },

    getPublicBookingPayload(slug) {
      return getPublicBookingPayloadView(this, provider.mode, slug);
    },

    async listAvailability(slug, companySizeValue, filters = {}) {
      const bookingLink = this.getBookingLinkBySlug(slug);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      return this.buildAvailability(bookingLink, companySizeValue, filters);
    },

    listCallerBookings(slug, callerId) {
      return listCallerBookingsView(
        db,
        this,
        slug,
        callerId,
        ACTIVE_SCHEDULE_STATES,
        fromBookingRow,
      );
    },

    listCallerTasks(callerId, clientId = null) {
      return listCallerTasksFn(db, callerId, clientId);
    },

    async buildAvailability(bookingLink, companySizeValue, filters = {}, options = {}) {
      return buildAvailabilityView(this, bookingLink, companySizeValue, filters, options, {
        bookingWindowWeeks: BOOKING_WINDOW_WEEKS,
        weekStartsOn: WEEK_STARTS_ON,
      });
    },

    async createBooking(slug, payload) {
      return createBookingFn(database, db, this, provider, slug, payload);
    },

    listAdminBookings(filters = {}) {
      return listAdminBookingsView(this, provider, filters);
    },

    listAdminCalendar(filters = {}) {
      return listAdminCalendarView(this, filters);
    },

    listAdminTasks(filters = {}) {
      return listAdminTasksView(this, filters);
    },

    getBookingDetail(bookingId) {
      return getAdminBookingDetail(this, bookingId);
    },

    async listBookingRescheduleAvailability(bookingId, filters = {}) {
      return listBookingRescheduleAvailabilityView(this, bookingId, filters, {
        weekStartsOn: WEEK_STARTS_ON,
      });
    },

    async updateBookingOutcome(bookingId, outcomeState, reason = "") {
      return updateBookingOutcomeFn(database, db, this, provider, bookingId, outcomeState, reason);
    },

    async updateBookingSchedule(bookingId, scheduleState, reason = "", nextStartAt = null) {
      return updateBookingScheduleFn(database, db, this, provider, bookingId, scheduleState, reason, nextStartAt);
    },

    updateTask(taskId, payload = {}) {
      return updateTaskFn(database, db, this, taskId, payload);
    },

    async refreshCalendarBookings() {
      if (provider.mode !== "nylas") {
        return { refreshed: 0 };
      }

      const bookings = this.listAllBookings().filter(
        (booking) =>
          booking.externalEventId &&
          ACTIVE_SCHEDULE_STATES.has(booking.scheduleState),
      );

      let refreshed = 0;
      for (const booking of bookings) {
        try {
          const externalEvent = await provider.fetchExternalEvent(this, booking);
          if (!externalEvent) {
            await this.applyProviderCancellation(booking, "Annulé côté calendrier client.");
            refreshed += 1;
            continue;
          }

          if (
            externalEvent.startAt.toISOString() !== booking.startAt ||
            externalEvent.endAt.toISOString() !== booking.endAt
          ) {
            await this.applyProviderReschedule(
              booking,
              externalEvent.startAt.toISOString(),
              externalEvent.endAt.toISOString(),
              "Rendez-vous déplacé côté calendrier client.",
            );
            refreshed += 1;
          }
        } catch {
          db.prepare(`
            UPDATE bookings
            SET calendar_sync_state = 'error'
            WHERE id = ?
          `).run(booking.id);
        }
      }

      return { refreshed };
    },

    async startRepConnection(repId, payload) {
      return startRepConnectionFn(provider, this, repId, payload);
    },

    async finalizeRepConnection(searchParams) {
      return finalizeRepConnectionFn(provider, this, searchParams);
    },

    async handleWebhook(payload = {}) {
      const receivedAt = new Date().toISOString();
      const grantId = extractGrantId(payload);
      const eventType = payload.type ?? payload.specversion ?? null;
      const externalId = extractExternalId(payload);

      database.withTransaction(() => {
        db.prepare(`
          INSERT INTO provider_webhook_events (
            id,
            provider,
            event_type,
            external_id,
            payload_json,
            received_at,
            processed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          makeId("webhook"),
          provider.mode === "nylas" ? "nylas" : "mock",
          eventType,
          externalId,
          JSON.stringify(payload),
          receivedAt,
          receivedAt,
        );

        if (grantId) {
          db.prepare(`
            UPDATE rep_calendar_connections
            SET last_webhook_at = ?, last_error = NULL
            WHERE provider_grant_id = ?
          `).run(receivedAt, grantId);
        }
      });

      const booking = externalId ? this.findBookingByExternalEventId(externalId) : null;
      if (booking) {
        if (isDeletionEvent(eventType)) {
          await this.applyProviderCancellation(
            booking,
            "Annulé côté calendrier client.",
          );
        } else if (isUpdateEvent(eventType)) {
          const fresh = await provider.fetchExternalEvent(this, booking);
          if (!fresh) {
            await this.applyProviderCancellation(
              booking,
              "Annulé côté calendrier client.",
            );
          } else if (
            fresh.startAt.toISOString() !== booking.startAt ||
            fresh.endAt.toISOString() !== booking.endAt
          ) {
            await this.applyProviderReschedule(
              booking,
              fresh.startAt.toISOString(),
              fresh.endAt.toISOString(),
              "Rendez-vous déplacé côté calendrier client.",
            );
          }
        }
      }

      this.listBookingLinks().forEach((link) => this.broadcastAvailability(link.slug));
      this.broadcastAdmin("booking.updated");
      this.broadcastAdmin("task.updated");
      this.broadcastAdmin("connections.updated");
      return { ok: true };
    },

    listSettings() {
      return {
        clients: this.listAllClients(),
        callers: this.listAllCallers(),
      };
    },

    createClient(payload = {}) {
      if (!payload.name?.trim()) {
        throw new Error("Le nom du client est obligatoire.");
      }

      const result = database.withTransaction(() => {
        const client = {
          id: makeId("client"),
          name: payload.name.trim(),
          timezone: payload.timezone?.trim() || "Europe/Paris",
          connectionInviteToken: `invite-${randomUUID()}`,
          routingMode: ROUTING_MODES.includes(payload.routingMode)
            ? payload.routingMode
            : "pool_unique",
          repConnectionFormConfig: Array.isArray(payload.repConnectionFormConfig)
            ? payload.repConnectionFormConfig
            : [],
          active: payload.active !== false,
        };

        db.prepare(`
          INSERT INTO clients (
            id,
            name,
            timezone,
            connection_invite_token,
            routing_mode,
            rep_connection_form_config_json,
            active
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          client.id,
          client.name,
          client.timezone,
          client.connectionInviteToken,
          client.routingMode,
          JSON.stringify(client.repConnectionFormConfig),
          toDbBool(client.active),
        );

        const bookingLink = buildDefaultBookingLink(db, client);
        insertBookingLink(db, bookingLink);
        insertRoutingPolicy(db, buildDefaultRoutingPolicy(bookingLink.id));

        return {
          client,
          workspace: toPublicWorkspace(bookingLink, client),
        };
      });

      this.broadcastAdmin("settings.updated");
      return result;
    },

    updateClient(clientId, payload = {}) {
      const client = this.getClient(clientId);
      if (!client) {
        throw new Error("Client introuvable.");
      }

      db.prepare(`
        UPDATE clients
        SET name = ?,
            timezone = ?,
            routing_mode = ?,
            rep_connection_form_config_json = ?,
            active = ?
        WHERE id = ?
      `).run(
        payload.name?.trim() || client.name,
        payload.timezone?.trim() || client.timezone,
        ROUTING_MODES.includes(payload.routingMode)
          ? payload.routingMode
          : client.routingMode,
        JSON.stringify(
          Array.isArray(payload.repConnectionFormConfig)
            ? payload.repConnectionFormConfig
            : client.repConnectionFormConfig,
        ),
        toDbBool(payload.active ?? client.active),
        clientId,
      );

      this.broadcastAdmin("settings.updated");
      return this.getClient(clientId);
    },

    createCaller(payload = {}) {
      if (!payload.name?.trim()) {
        throw new Error("Le nom du caller est obligatoire.");
      }

      const caller = {
        id: makeId("caller"),
        name: payload.name.trim(),
        active: payload.active !== false,
      };

      db.prepare(`
        INSERT INTO callers (id, name, active)
        VALUES (?, ?, ?)
      `).run(caller.id, caller.name, toDbBool(caller.active));

      this.broadcastAdmin("settings.updated");
      return caller;
    },

    updateCaller(callerId, payload = {}) {
      const caller = this.getCaller(callerId);
      if (!caller) {
        throw new Error("Caller introuvable.");
      }

      db.prepare(`
        UPDATE callers
        SET name = ?,
            active = ?
        WHERE id = ?
      `).run(
        payload.name?.trim() || caller.name,
        toDbBool(payload.active ?? caller.active),
        callerId,
      );

      this.broadcastAdmin("settings.updated");
      return this.getCaller(callerId);
    },

    listReps() {
      return this.listAllReps().map((rep) =>
        decorateRep(rep, this.getConnection(rep.id), provider.mode),
      );
    },

    decorateRep(rep) {
      return decorateRep(rep, this.getConnection(rep.id), provider.mode);
    },

    addSseClient(slug, response) {
      if (!sseClients.has(slug)) {
        sseClients.set(slug, new Set());
      }
      sseClients.get(slug).add(response);
    },

    removeSseClient(slug, response) {
      sseClients.get(slug)?.delete(response);
    },

    addAdminSseClient(response) {
      adminSseClients.add(response);
    },

    removeAdminSseClient(response) {
      adminSseClients.delete(response);
    },

    broadcastAvailability(slug) {
      const clients = sseClients.get(slug);
      if (!clients || clients.size === 0) {
        return;
      }

      const payload = `event: availability.updated\ndata: ${JSON.stringify({
        slug,
        at: new Date().toISOString(),
      })}\n\n`;
      clients.forEach((response) => response.write(payload));
    },

    broadcastAdmin(eventName = "booking.updated") {
      if (adminSseClients.size === 0) {
        return;
      }
      const payload = `event: ${eventName}\ndata: ${JSON.stringify({
        at: new Date().toISOString(),
      })}\n\n`;
      adminSseClients.forEach((response) => response.write(payload));
    },

    broadcastClientAvailability(clientId) {
      this.listBookingLinksForClient(clientId).forEach((link) =>
        this.broadcastAvailability(link.slug),
      );
      this.broadcastAdmin("connections.updated");
    },

    getBookingLinkBySlug(slug) {
      const row = db
        .prepare("SELECT * FROM booking_links WHERE slug = ? AND active = 1")
        .get(slug);
      return row ? fromBookingLinkRow(row) : null;
    },

    getBookingLinkById(bookingLinkId) {
      const row = db
        .prepare("SELECT * FROM booking_links WHERE id = ?")
        .get(bookingLinkId);
      return row ? fromBookingLinkRow(row) : null;
    },

    listBookingLinks() {
      return db
        .prepare("SELECT * FROM booking_links ORDER BY title ASC")
        .all()
        .map(fromBookingLinkRow);
    },

    listBookingLinksForClient(clientId) {
      return db
        .prepare("SELECT * FROM booking_links WHERE client_id = ? ORDER BY title ASC")
        .all(clientId)
        .map(fromBookingLinkRow);
    },

    listPublicBookingLinks() {
      return this.listBookingLinks()
        .filter((link) => link.active)
        .map((link) => {
          const client = this.getClient(link.clientId);
          if (!client?.active) {
            return null;
          }

          return {
            id: link.id,
            slug: link.slug,
            clientId: link.clientId,
            clientName: client.name,
            title: link.title,
            timezone: link.timezone,
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          const clientDelta = left.clientName.localeCompare(right.clientName);
          if (clientDelta !== 0) {
            return clientDelta;
          }
          return left.title.localeCompare(right.title);
        });
    },

    listAllClients() {
      return db
        .prepare("SELECT * FROM clients ORDER BY name ASC")
        .all()
        .map(fromClientRow);
    },

    getClient(clientId) {
      const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
      return row ? fromClientRow(row) : null;
    },

    getClientByInviteToken(inviteToken) {
      const row = db
        .prepare("SELECT * FROM clients WHERE connection_invite_token = ? AND active = 1")
        .get(inviteToken);
      return row ? fromClientRow(row) : null;
    },

    getPublicRepConnectionPayload(inviteToken) {
      return getPublicRepConnectionPayloadFn(this, inviteToken);
    },

    async startPublicRepConnection(inviteToken, payload = {}) {
      return startPublicRepConnectionFn(this, inviteToken, payload);
    },

    listAllCallers() {
      return db
        .prepare("SELECT * FROM callers ORDER BY name ASC")
        .all()
        .map(fromCallerRow);
    },

    listActiveCallers() {
      return this.listAllCallers().filter((caller) => caller.active);
    },

    getCaller(callerId) {
      const row = db.prepare("SELECT * FROM callers WHERE id = ?").get(callerId);
      return row ? fromCallerRow(row) : null;
    },

    listAllReps() {
      return db
        .prepare("SELECT * FROM reps ORDER BY sort_order ASC, name ASC")
        .all()
        .map(fromRepRow);
    },

    getRep(repId) {
      const row = db.prepare("SELECT * FROM reps WHERE id = ?").get(repId);
      return row ? fromRepRow(row) : null;
    },

    findRepsByNormalizedName(clientId, fullName) {
      const normalizedName = normalizePersonName(fullName);
      return this.listAllReps().filter(
        (rep) =>
          rep.clientId === clientId &&
          normalizePersonName(rep.name) === normalizedName,
      );
    },

    updateRep(repId, payload = {}) {
      const rep = this.getRep(repId);
      if (!rep) {
        throw new Error("Rep introuvable.");
      }
      if (payload.clientId !== undefined && payload.clientId !== rep.clientId) {
        throw new Error("Le client d'un rep ne peut pas être modifié.");
      }

      db.prepare(`
        UPDATE reps
        SET name = ?,
            email = ?,
            seniority = ?,
            timezone = ?,
            active = ?,
            sort_order = ?
        WHERE id = ?
      `).run(
        payload.name?.trim() || rep.name,
        payload.email ?? rep.email,
        REP_ROLES.includes(payload.seniority) ? payload.seniority : rep.seniority,
        payload.timezone?.trim() || rep.timezone,
        toDbBool(payload.active ?? rep.active),
        payload.sortOrder ?? rep.sortOrder,
        repId,
      );

      return this.getRep(repId);
    },

    createRep(payload = {}) {
      const client = this.getClient(payload.clientId);
      if (!client) {
        throw new Error("Client introuvable pour ce rep.");
      }

      const maxSortOrderRow = db
        .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM reps WHERE client_id = ?")
        .get(client.id);

      const rep = {
        id: makeId("rep"),
        clientId: client.id,
        name: payload.name?.trim(),
        email: payload.email ?? "",
        seniority: REP_ROLES.includes(payload.seniority)
          ? payload.seniority
          : "non_defini",
        timezone: payload.timezone?.trim() || client.timezone,
        active: payload.active !== false,
        sortOrder: payload.sortOrder ?? (maxSortOrderRow?.max_sort_order ?? 0) + 1,
      };

      if (!rep.name) {
        throw new Error("Le nom du rep est obligatoire.");
      }

      db.prepare(`
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
      `).run(
        rep.id,
        rep.clientId,
        rep.name,
        rep.email,
        rep.seniority,
        rep.timezone,
        toDbBool(rep.active),
        rep.sortOrder,
      );

      this.broadcastAdmin("settings.updated");
      return this.getRep(rep.id);
    },

    findOrCreateRepForPublicConnection(client, payload = {}) {
      const fullName = `${payload.firstName?.trim() ?? ""} ${payload.lastName?.trim() ?? ""}`.trim();
      const matchingReps = this.findRepsByNormalizedName(client.id, fullName);

      if (matchingReps.length > 1) {
        throw new Error(
          "Plusieurs commerciaux correspondent à ce nom. Contactez Be Nice pour finaliser la connexion.",
        );
      }

      if (matchingReps.length === 1) {
        return this.updateRep(matchingReps[0].id, {
          name: fullName,
          seniority: payload.role,
          active: true,
        });
      }

      return this.createRep({
        clientId: client.id,
        name: fullName,
        seniority: payload.role,
        timezone: client.timezone,
        email: "",
        active: true,
      });
    },

    getConnection(repId) {
      return getConnection(db, repId);
    },

    findConflictingConnections(identity, options) {
      return findConflictingConnections(db, identity, options);
    },

    disconnectConnection(repId, patch) {
      return disconnectConnection(db, provider, repId, patch);
    },

    claimCalendarConnection(repId, patch) {
      return claimCalendarConnection(database, db, provider, this, repId, patch);
    },

    upsertConnection(repId, patch) {
      return upsertConnection(db, provider, repId, patch);
    },

    getRoutingPolicy(bookingLinkId) {
      const row = db
        .prepare("SELECT * FROM routing_policies WHERE booking_link_id = ?")
        .get(bookingLinkId);
      return row ? fromRoutingPolicyRow(row) : null;
    },

    getRepsForLink(bookingLinkId) {
      const bookingLink = this.getBookingLinkById(bookingLinkId);
      if (!bookingLink) {
        return [];
      }

      return this.listAllReps().filter((rep) => {
        const connection = this.getConnection(rep.id);
        return (
          rep.clientId === bookingLink.clientId &&
          rep.active &&
          isConnectionUsable(connection, provider.mode)
        );
      });
    },

    getEligibleReps(bookingLinkId, companySize) {
      return getEligibleRepsFn(this, bookingLinkId, companySize);
    },

    isRepAvailableAgainstIntervals(intervals, slotStart, bookingLink) {
      return isRepAvailableAgainstIntervals(intervals, slotStart, bookingLink);
    },

    async getBusyIntervalsForReps(reps, interval, options = {}) {
      return getBusyIntervalsForRepsFn(db, this, provider, reps, interval, options);
    },

    async getBusyIntervals(repId, interval, options = {}) {
      return getBusyIntervalsFn(db, this, provider, repId, interval, options);
    },

    async getAvailableEligibleRepsForSlot(bookingLink, companySize, slotStart, options = {}) {
      return getAvailableEligibleRepsForSlotFn(db, this, provider, bookingLink, companySize, slotStart, options);
    },

    assignRep(bookingLink, companySize, slotStart, eligibleReps) {
      return assignRepFn(db, this, bookingLink, companySize, slotStart, eligibleReps);
    },

    getRollingCounts(bookingLinkId) {
      return getRollingCountsFn(db, this, bookingLinkId);
    },

    getRepRollingLoad(repId, bookingLinkId) {
      return getRepRollingLoadFn(db, repId, bookingLinkId);
    },

    listAllBookings() {
      return db
        .prepare("SELECT * FROM bookings ORDER BY start_at DESC")
        .all()
        .map(fromBookingRow);
    },

    getBooking(bookingId) {
      const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
      return row ? fromBookingRow(row) : null;
    },

    findBookingByExternalEventId(externalEventId) {
      const row = db
        .prepare("SELECT * FROM bookings WHERE external_event_id = ?")
        .get(externalEventId);
      return row ? fromBookingRow(row) : null;
    },

    listAllTasks() {
      return listAllTasksFn(db);
    },

    getTask(taskId) {
      return getTaskFn(db, taskId);
    },

    getOpenTaskByBookingId(bookingId) {
      return getOpenTaskByBookingIdFn(db, bookingId);
    },

    getTaskByReplacement(bookingId) {
      return getTaskByReplacementFn(db, bookingId);
    },

    async replaceExternalEventForReschedule(currentBooking, nextBooking, nextRep) {
      const nextExternalEventId = await provider.createExternalEvent(
        this,
        nextRep,
        nextBooking,
      );

      try {
        if (currentBooking.externalEventId) {
          await provider.releaseExternalEvent(this, currentBooking);
        }
      } catch (error) {
        try {
          await provider.releaseExternalEvent(this, {
            assignedRepId: nextRep.id,
            externalEventId: nextExternalEventId,
          });
        } catch {
          // Best effort cleanup only.
        }
        throw error;
      }

      return nextExternalEventId;
    },

    getTimelineForBooking(bookingId) {
      return getBookingTimeline(db, bookingId);
    },

    toBookingSummary(booking) {
      return toBookingSummaryView(this, booking, ACTIVE_SCHEDULE_STATES, provider.mode);
    },

    getCallerCancelMode(booking) {
      return getCallerCancelModeView(this, booking, ACTIVE_SCHEDULE_STATES, provider.mode);
    },

    getClientStats(bookings, tasks) {
      return getAdminClientStats(this, bookings, tasks);
    },

    filterBookings(bookings, filters = {}) {
      return filterAdminBookings(this, bookings, filters);
    },

    filterTasks(tasks, filters = {}) {
      return filterAdminTasks(tasks, filters);
    },

    insertLegacyStatusHistory({
      bookingId,
      fromStatus,
      toStatus,
      actorType,
      actorLabel,
      reason,
      createdAt = new Date().toISOString(),
    }) {
      db.prepare(`
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
      `).run(
        makeId("history"),
        bookingId,
        fromStatus,
        toStatus,
        actorType,
        actorLabel,
        reason || null,
        createdAt,
      );
    },

    insertTimelineEvent({
      bookingId,
      type,
      actorLabel,
      reason,
      createdAt = new Date().toISOString(),
      meta,
    }) {
      db.prepare(`
        INSERT INTO booking_timeline_events (
          id,
          booking_id,
          event_type,
          actor_label,
          reason,
          meta_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        makeId("timeline"),
        bookingId,
        type,
        actorLabel,
        reason || null,
        meta ? JSON.stringify(meta) : null,
        createdAt,
      );
    },

    ensureFollowUpTask(bookingId, triggerReason, createdAt = new Date().toISOString()) {
      return ensureFollowUpTaskFn(db, this, bookingId, triggerReason, createdAt);
    },

    completeTask(taskId, replacementBookingId, createdAt = new Date().toISOString()) {
      return completeTaskFn(db, this, taskId, replacementBookingId, createdAt);
    },

    _applyProviderBookingChange(booking, { updateStmt, historyStatus, timelineType, timelineMeta, reason, createdAt }) {
      database.withTransaction(() => {
        updateStmt();

        this.insertLegacyStatusHistory({
          bookingId: booking.id,
          fromStatus: getLegacyStatus(booking),
          toStatus: historyStatus,
          actorType: "system",
          actorLabel: "Calendrier client",
          reason,
          createdAt,
        });

        this.insertTimelineEvent({
          bookingId: booking.id,
          type: timelineType,
          actorLabel: "Calendrier client",
          reason,
          createdAt,
          ...(timelineMeta ? { meta: timelineMeta } : {}),
        });

        if (historyStatus === "cancelled") {
          this.ensureFollowUpTask(booking.id, "cancelled", createdAt);
        }
      });

      const link = this.getBookingLinkById(booking.bookingLinkId);
      if (link) {
        this.broadcastAvailability(link.slug);
      }
    },

    async applyProviderCancellation(booking, reason) {
      if (booking.scheduleState === "cancelled") {
        return;
      }

      const createdAt = new Date().toISOString();
      this._applyProviderBookingChange(booking, {
        updateStmt: () => db.prepare(`
          UPDATE bookings
          SET schedule_state = 'cancelled',
              status = 'cancelled',
              cancelled_at = ?,
              last_calendar_change_at = ?,
              calendar_sync_state = 'synced'
          WHERE id = ?
        `).run(createdAt, createdAt, booking.id),
        historyStatus: "cancelled",
        timelineType: "calendar_cancelled",
        reason,
        createdAt,
      });
    },

    async applyProviderReschedule(booking, nextStartAt, nextEndAt, reason) {
      const createdAt = new Date().toISOString();
      this._applyProviderBookingChange(booking, {
        updateStmt: () => db.prepare(`
          UPDATE bookings
          SET schedule_state = 'rescheduled',
              status = 'rescheduled',
              previous_start_at = ?,
              start_at = ?,
              end_at = ?,
              last_calendar_change_at = ?,
              calendar_sync_state = 'synced'
          WHERE id = ?
        `).run(booking.startAt, nextStartAt, nextEndAt, createdAt, booking.id),
        historyStatus: "rescheduled",
        timelineType: "calendar_rescheduled",
        timelineMeta: { previousStartAt: booking.startAt, nextStartAt },
        reason,
        createdAt,
      });
    },

    async cancelCallerBooking(slug, callerId, bookingId) {
      return cancelCallerBookingFn(database, db, this, provider, slug, callerId, bookingId);
    },
  };

  initializeTimeline(store, db);
  initializeFollowUpTasks(store, db);

  return store;
}

function initializeTimeline(store, db) {
  const rows = db.prepare("SELECT COUNT(*) AS count FROM booking_timeline_events").get();
  if (rows?.count > 0) {
    return;
  }

  const historyRows = db
    .prepare(`
      SELECT *
      FROM booking_status_history
      ORDER BY created_at ASC
    `)
    .all();

  historyRows.forEach((entry) => {
    let type = "booking_created";
    let meta = null;
    if (entry.to_status === "cancelled") {
      type = "calendar_cancelled";
    } else if (entry.to_status === "rescheduled") {
      type = "calendar_rescheduled";
    } else if (
      entry.to_status === "completed" ||
      entry.to_status === "no_show" ||
      entry.to_status === "not_qualified"
    ) {
      type = "outcome_set";
      meta = {
        outcomeState:
          entry.to_status === "completed"
            ? "completed"
            : entry.to_status === "no_show"
              ? "no_show"
              : "not_qualified",
      };
    }

    store.insertTimelineEvent({
      bookingId: entry.booking_id,
      type,
      actorLabel: entry.actor_label,
      reason: entry.reason,
      createdAt: entry.created_at,
      meta,
    });
  });
}

function initializeFollowUpTasks(store) {
  store
    .listAllBookings()
    .filter((booking) => {
      const displayStatus = getDisplayStatus(booking);
      return displayStatus === "no_show" || displayStatus === "cancelled";
    })
    .forEach((booking) => {
      store.ensureFollowUpTask(
        booking.id,
        getDisplayStatus(booking) === "cancelled" ? "cancelled" : "no_show",
        booking.noShowAt ?? booking.cancelledAt ?? booking.createdAt,
      );
    });
}

function decorateRep(rep, connection, providerMode) {
  return {
    ...rep,
    businessEmail: rep.email,
    connectionStatus: getEffectiveConnectionStatus(connection, providerMode),
    provider: connection?.provider ?? "mock",
    providerEmail: connection?.providerEmail ?? null,
    connectedAt: connection?.connectedAt ?? null,
    lastSyncAt: connection?.lastSyncAt ?? null,
    lastWebhookAt: connection?.lastWebhookAt ?? null,
    lastError: connection?.lastError ?? null,
  };
}



function matchesQuery(query, fields) {
  const needle = query.toLowerCase();
  const haystack = fields.join(" ").toLowerCase();
  return haystack.includes(needle);
}

function blankStatusCounts() {
  return Object.fromEntries(DISPLAY_STATUSES.map((status) => [status, 0]));
}



function extractGrantId(payload) {
  return (
    payload?.data?.grant_id ??
    payload?.data?.object?.grant_id ??
    payload?.grant_id ??
    null
  );
}

function extractExternalId(payload) {
  return (
    payload?.data?.object?.id ??
    payload?.data?.id ??
    payload?.id ??
    payload?.specversion ??
    null
  );
}

function isDeletionEvent(eventType) {
  return typeof eventType === "string" && /deleted|cancelled/i.test(eventType);
}

function isUpdateEvent(eventType) {
  return typeof eventType === "string" && /updated/i.test(eventType);
}

function fromClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    connectionInviteToken: row.connection_invite_token ?? null,
    routingMode:
      ROUTING_MODES.includes(row.routing_mode) ? row.routing_mode : "pool_unique",
    repConnectionFormConfig: parseJson(row.rep_connection_form_config_json, []),
    active: Boolean(row.active),
  };
}

function fromCallerRow(row) {
  return {
    id: row.id,
    name: row.name,
    active: Boolean(row.active),
  };
}

function fromBookingLinkRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    slug: row.slug,
    title: row.title,
    timezone: row.timezone,
    durationMinutes: row.duration_minutes,
    intervalMinutes: row.interval_minutes,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    active: Boolean(row.active),
  };
}

function fromRepRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    email: row.email,
    seniority: row.seniority,
    timezone: row.timezone,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
  };
}

function fromRoutingPolicyRow(row) {
  return {
    id: row.id,
    bookingLinkId: row.booking_link_id,
    companySizeThreshold: row.company_size_threshold,
    seniorWeight: row.senior_weight,
    juniorWeight: row.junior_weight,
  };
}

function fromBookingRow(row) {
  return {
    id: row.id,
    bookingLinkId: row.booking_link_id,
    clientId: row.client_id,
    callerId: row.caller_id,
    assignedRepId: row.assigned_rep_id,
    companyName: row.company_name,
    companySize: row.company_size,
    prospectName: row.prospect_name,
    prospectEmail: row.prospect_email,
    notes: row.notes ?? "",
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    status: row.status,
    scheduleState: row.schedule_state ?? "scheduled",
    outcomeState: row.outcome_state ?? "pending",
    originalStartAt: row.original_start_at ?? row.start_at,
    previousStartAt: row.previous_start_at ?? null,
    lastCalendarChangeAt: row.last_calendar_change_at ?? null,
    calendarSyncState: row.calendar_sync_state ?? row.sync_state ?? "synced",
    cancelledAt: row.cancelled_at ?? null,
    completedAt: row.completed_at ?? null,
    noShowAt: row.no_show_at ?? null,
    externalEventId: row.external_event_id ?? "",
    assignmentReason: parseJson(row.assignment_reason_json),
    syncState: row.sync_state,
    createdAt: row.created_at,
  };
}

function normalizePersonName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function ensureDefaultClientArtifacts(db) {
  const clientsWithoutWorkspace = db
    .prepare(`
      SELECT *
      FROM clients
      WHERE NOT EXISTS (
        SELECT 1
        FROM booking_links
        WHERE booking_links.client_id = clients.id
      )
      ORDER BY name ASC
    `)
    .all()
    .map(fromClientRow);

  clientsWithoutWorkspace.forEach((client) => {
    const bookingLink = buildDefaultBookingLink(db, client);
    insertBookingLink(db, bookingLink);
    insertRoutingPolicy(db, buildDefaultRoutingPolicy(bookingLink.id));
  });

  const bookingLinksWithoutPolicy = db
    .prepare(`
      SELECT *
      FROM booking_links
      WHERE NOT EXISTS (
        SELECT 1
        FROM routing_policies
        WHERE routing_policies.booking_link_id = booking_links.id
      )
      ORDER BY title ASC
    `)
    .all()
    .map(fromBookingLinkRow);

  bookingLinksWithoutPolicy.forEach((bookingLink) => {
    insertRoutingPolicy(db, buildDefaultRoutingPolicy(bookingLink.id));
  });
}

function buildDefaultBookingLink(db, client) {
  const slug = createUniqueWorkspaceSlug(db, client.name);

  return {
    id: makeId("booking-link"),
    clientId: client.id,
    slug,
    title: `Discovery call ${client.name}`,
    timezone: client.timezone,
    durationMinutes: DEFAULT_WORKSPACE_DURATION_MINUTES,
    intervalMinutes: DEFAULT_WORKSPACE_INTERVAL_MINUTES,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: DEFAULT_WORKSPACE_MIN_NOTICE_MINUTES,
    active: true,
  };
}

function buildDefaultRoutingPolicy(bookingLinkId) {
  return {
    id: makeId("routing"),
    bookingLinkId,
    companySizeThreshold: DEFAULT_COMPANY_SIZE_THRESHOLD,
    seniorWeight: DEFAULT_SENIOR_WEIGHT,
    juniorWeight: DEFAULT_JUNIOR_WEIGHT,
  };
}

function insertBookingLink(db, bookingLink) {
  db.prepare(`
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
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bookingLink.id,
    bookingLink.clientId,
    bookingLink.slug,
    bookingLink.title,
    bookingLink.timezone,
    bookingLink.durationMinutes,
    bookingLink.intervalMinutes,
    bookingLink.bufferBeforeMinutes,
    bookingLink.bufferAfterMinutes,
    bookingLink.minNoticeMinutes,
    toDbBool(bookingLink.active),
  );
}

function insertRoutingPolicy(db, policy) {
  db.prepare(`
    INSERT INTO routing_policies (
      id,
      booking_link_id,
      company_size_threshold,
      senior_weight,
      junior_weight
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    policy.id,
    policy.bookingLinkId,
    policy.companySizeThreshold,
    policy.seniorWeight,
    policy.juniorWeight,
  );
}

function createUniqueWorkspaceSlug(db, clientName) {
  const baseSlug = `${slugify(clientName)}-discovery`;
  let slug = baseSlug;
  let suffix = 2;

  while (db.prepare("SELECT 1 FROM booking_links WHERE slug = ?").get(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

function slugify(value) {
  const slug = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "client";
}

function toPublicWorkspace(bookingLink, client) {
  return {
    id: bookingLink.id,
    slug: bookingLink.slug,
    clientId: bookingLink.clientId,
    clientName: client.name,
    title: bookingLink.title,
    timezone: bookingLink.timezone,
  };
}

function toDbBool(value) {
  return value ? 1 : 0;
}
