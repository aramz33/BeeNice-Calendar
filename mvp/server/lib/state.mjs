import {randomUUID} from "node:crypto";
import {createDatabase} from "./database.mjs";
import {makeId} from "./utils.mjs";
import {createNotificationsModule} from "./notifications.mjs";
import {
  completeTask as completeTaskFn,
  ensureFollowUpTask as ensureFollowUpTaskFn,
  getOpenTaskByBookingId as getOpenTaskByBookingIdFn,
  getTask as getTaskFn,
  getTaskByReplacement as getTaskByReplacementFn,
  listAllTasks as listAllTasksFn,
  listCallerTasks as listCallerTasksFn,
  updateTask as updateTaskFn,
} from "./tasks.mjs";
import {
  claimCalendarConnection,
  disconnectConnection,
  finalizeRepConnection as finalizeRepConnectionFn,
  findConflictingConnections,
  getConnection,
  getEffectiveConnectionStatus,
  getPublicRepConnectionPayload as getPublicRepConnectionPayloadFn,
  isConnectionUsable,
  REP_ROLES,
  startPublicRepConnection as startPublicRepConnectionFn,
  startRepConnection as startRepConnectionFn,
  upsertConnection,
} from "./connections.mjs";
import {createAvailabilityModule,} from "./availability.mjs";
import {validateWeights} from "./routing.mjs";
import {
  cancelCallerBooking as cancelCallerBookingFn,
  createBooking as createBookingFn,
  getDisplayStatus,
  getLegacyStatus,
  updateBookingOutcome as updateBookingOutcomeFn,
  updateBookingSchedule as updateBookingScheduleFn,
} from "./bookings.mjs";
import {
  listCallerBookings as listCallerBookingsView,
} from "./store/public-booking.mjs";
import {createPersistenceAdapter} from "./store/persistence.mjs";
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
  "mvn",
  "refused",
];

const ROUTING_MODES = ["pool_unique", "weighted_seniority"];

const ACTIVE_SCHEDULE_STATES = new Set(["scheduled", "rescheduled"]);
const BOOKING_WINDOW_WEEKS = 12;
const WEEK_STARTS_ON = 1;
const DEFAULT_WORKSPACE_DURATION_MINUTES = 30;
const DEFAULT_WORKSPACE_INTERVAL_MINUTES = 30;
const DEFAULT_WORKSPACE_BUFFER_BEFORE_MINUTES = 15;
const DEFAULT_WORKSPACE_BUFFER_AFTER_MINUTES = 15;
const DEFAULT_WORKSPACE_MIN_NOTICE_MINUTES = 60;
const DEFAULT_COMPANY_SIZE_THRESHOLD = 200;
const DEFAULT_SENIOR_WEIGHT = 0.8;
const DEFAULT_JUNIOR_WEIGHT = 0.2;

export function createStore(provider, storeConfig = {}) {
  const database = createDatabase(provider.mode);
  const { db } = database;
    const records = createPersistenceAdapter(db);
    const defaultArtifacts = {
        workspaceDurationMinutes: DEFAULT_WORKSPACE_DURATION_MINUTES,
        workspaceIntervalMinutes: DEFAULT_WORKSPACE_INTERVAL_MINUTES,
        workspaceBufferBeforeMinutes: DEFAULT_WORKSPACE_BUFFER_BEFORE_MINUTES,
        workspaceBufferAfterMinutes: DEFAULT_WORKSPACE_BUFFER_AFTER_MINUTES,
        workspaceMinNoticeMinutes: DEFAULT_WORKSPACE_MIN_NOTICE_MINUTES,
        companySizeThreshold: DEFAULT_COMPANY_SIZE_THRESHOLD,
        seniorWeight: DEFAULT_SENIOR_WEIGHT,
        juniorWeight: DEFAULT_JUNIOR_WEIGHT,
    };
  database.withTransaction(() => {
      records.ensureDefaultClientArtifacts(defaultArtifacts);
  });
    const notifications = createNotificationsModule({
        listBookingLinksForClient: (clientId) => records.listBookingLinksForClient(clientId),
    });
    let availability;

  const store = {
    displayStatuses: DISPLAY_STATUSES,
    dbFile: database.filename,
    getDisplayStatus,
    close() {
      database.close();
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
          records.fromBookingRow,
      );
    },

    listCallerTasks(callerId, clientId = null) {
      return listCallerTasksFn(db, callerId, clientId);
    },

    async buildAvailability(bookingLink, companySizeValue, filters = {}, options = {}) {
        return availability.buildSlots(bookingLink, companySizeValue, filters, options);
    },

      async assignRepForSlot(bookingLink, companySize, slotStart, options = {}) {
          return availability.assignRepForSlot(bookingLink, companySize, slotStart, options);
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

          const rsvpState = extractProspectRsvpState(fresh.participants, booking.prospectEmail);
          if (rsvpState) this.updateProspectRsvpState(booking.id, rsvpState);
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

          records.insertClient(client);

          const bookingLink = records.buildDefaultBookingLink(client, defaultArtifacts);
          records.insertBookingLink(bookingLink);
          records.insertRoutingPolicy(
              records.buildDefaultRoutingPolicy(bookingLink.id, defaultArtifacts),
          );

        return {
          client,
            workspace: records.toPublicWorkspace(bookingLink, client),
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

        records.updateClient(clientId, {
            name: payload.name?.trim() || client.name,
            timezone: payload.timezone?.trim() || client.timezone,
            routingMode: ROUTING_MODES.includes(payload.routingMode)
          ? payload.routingMode
          : client.routingMode,
            repConnectionFormConfig: Array.isArray(payload.repConnectionFormConfig)
                ? payload.repConnectionFormConfig
                : client.repConnectionFormConfig,
            active: payload.active ?? client.active,
        });

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

        records.insertCaller(caller);

      this.broadcastAdmin("settings.updated");
      return caller;
    },

    updateCaller(callerId, payload = {}) {
      const caller = this.getCaller(callerId);
      if (!caller) {
        throw new Error("Caller introuvable.");
      }

        records.updateCaller(callerId, {
            name: payload.name?.trim() || caller.name,
            active: payload.active ?? caller.active,
        });

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
        notifications.addSseClient(slug, response);
    },

    removeSseClient(slug, response) {
        notifications.removeSseClient(slug, response);
    },

    addAdminSseClient(response) {
        notifications.addAdminSseClient(response);
    },

    removeAdminSseClient(response) {
        notifications.removeAdminSseClient(response);
    },

    broadcastAvailability(slug) {
        notifications.broadcastAvailability(slug);
    },

    broadcastAdmin(eventName = "booking.updated") {
        notifications.broadcastAdmin(eventName);
    },

    broadcastClientAvailability(clientId) {
        notifications.broadcastClientAvailability(clientId);
    },

    getBookingLinkBySlug(slug) {
        return records.getBookingLinkBySlug(slug);
    },

    getBookingLinkById(bookingLinkId) {
        return records.getBookingLinkById(bookingLinkId);
    },

    listBookingLinks() {
        return records.listBookingLinks();
    },

    listBookingLinksForClient(clientId) {
        return records.listBookingLinksForClient(clientId);
    },

    listPublicBookingLinks() {
        return records.listPublicBookingLinks();
    },

    listAllClients() {
        return records.listAllClients();
    },

    getClient(clientId) {
        return records.getClient(clientId);
    },

    getClientByInviteToken(inviteToken) {
        return records.getClientByInviteToken(inviteToken);
    },

    getPublicRepConnectionPayload(inviteToken) {
      return getPublicRepConnectionPayloadFn(this, inviteToken);
    },

    async startPublicRepConnection(inviteToken, payload = {}) {
      return startPublicRepConnectionFn(this, inviteToken, payload);
    },

    listAllCallers() {
        return records.listAllCallers();
    },

    listActiveCallers() {
        return records.listActiveCallers();
    },

    getCaller(callerId) {
        return records.getCaller(callerId);
    },

    listAllReps() {
        return records.listAllReps();
    },

    getRep(repId) {
        return records.getRep(repId);
    },

    findRepsByNormalizedName(clientId, fullName) {
        return records.findRepsByNormalizedName(clientId, fullName);
    },

    updateRep(repId, payload = {}) {
      const rep = this.getRep(repId);
      if (!rep) {
        throw new Error("Rep introuvable.");
      }
      if (payload.clientId !== undefined && payload.clientId !== rep.clientId) {
        throw new Error("Le client d'un rep ne peut pas être modifié.");
      }

        records.updateRep(repId, {
            name: payload.name?.trim() || rep.name,
            email: payload.email ?? rep.email,
            seniority: REP_ROLES.includes(payload.seniority) ? payload.seniority : rep.seniority,
            timezone: payload.timezone?.trim() || rep.timezone,
            active: payload.active ?? rep.active,
            sortOrder: payload.sortOrder ?? rep.sortOrder,
            weightPct: payload.weightPct !== undefined ? payload.weightPct : rep.weightPct,
        });

      return this.getRep(repId);
    },

    updateRepWeight(repId, weightPct) {
      const rep = this.getRep(repId);
      if (!rep) {
        throw new Error("Rep introuvable.");
      }

      const normalized = weightPct === null || weightPct === undefined || weightPct === ""
        ? null
        : Number(weightPct);
      if (normalized !== null && Number.isNaN(normalized)) {
        throw new Error("Le pourcentage doit être un nombre ou vide.");
      }

      const proposedReps = this.listAllReps()
        .filter((candidate) => candidate.clientId === rep.clientId && candidate.active)
        .map((candidate) =>
          candidate.id === repId ? { ...candidate, weightPct: normalized } : candidate,
        );

      const validation = validateWeights(proposedReps);
      if (!validation.ok) {
        throw new Error(validation.error);
      }

      const updated = this.updateRep(repId, { weightPct: normalized });
      this.broadcastAdmin("settings.updated");
      return { rep: updated, warning: validation.warning ?? null };
    },

    createRep(payload = {}) {
      const client = this.getClient(payload.clientId);
      if (!client) {
        throw new Error("Client introuvable pour ce rep.");
      }

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
          sortOrder: payload.sortOrder ?? records.getMaxRepSortOrder(client.id) + 1,
        weightPct: payload.weightPct ?? null,
      };

      if (!rep.name) {
        throw new Error("Le nom du rep est obligatoire.");
      }

        records.insertRep(rep);

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
        return records.getRoutingPolicy(bookingLinkId);
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

    listAllBookings() {
        return records.listAllBookings();
    },

    getBooking(bookingId) {
        return records.getBooking(bookingId);
    },

    findBookingByExternalEventId(externalEventId) {
        return records.findBookingByExternalEventId(externalEventId);
    },

    updateProspectRsvpState(bookingId, rsvpState) {
        return records.updateProspectRsvpState(bookingId, rsvpState);
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
        records.insertLegacyStatusHistory({
        bookingId,
        fromStatus,
        toStatus,
        actorType,
        actorLabel,
            reason,
        createdAt,
        });
    },

    insertTimelineEvent({
      bookingId,
      type,
      actorLabel,
      reason,
      createdAt = new Date().toISOString(),
      meta,
    }) {
        records.insertTimelineEvent({
        bookingId,
        type,
        actorLabel,
            reason,
        createdAt,
            meta,
        });
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

    availability = createAvailabilityModule({
        db,
        store,
        provider,
        config: {
            bookingWindowWeeks: BOOKING_WINDOW_WEEKS,
            weekStartsOn: WEEK_STARTS_ON,
            now: storeConfig.now,
        },
    });

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

const REPOSITIONABLE_DISPLAY_STATUSES = new Set(["no_show", "cancelled", "refused"]);

function initializeFollowUpTasks(store) {
  store
    .listAllBookings()
    .filter((booking) => REPOSITIONABLE_DISPLAY_STATUSES.has(getDisplayStatus(booking)))
    .forEach((booking) => {
      store.ensureFollowUpTask(
        booking.id,
        getDisplayStatus(booking),
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

function extractProspectRsvpState(participants = [], prospectEmail) {
  const match = participants.find(
    (p) => p.email?.toLowerCase() === prospectEmail?.toLowerCase(),
  );
  if (!match) return null;
  if (match.status === "yes") return "accepted";
  if (match.status === "no") return "declined";
  return "pending";
}
