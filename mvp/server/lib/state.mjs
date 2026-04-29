import { randomUUID } from "node:crypto";
import {
  addDays,
  addMinutes,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfWeek,
  format,
  getDay,
  isWeekend,
  parseISO,
  set,
  startOfWeek,
  startOfToday,
  subMinutes,
} from "date-fns";
import { createDatabase } from "./database.mjs";
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

const DISPLAY_STATUSES = [
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
  "rescheduled",
  "not_qualified",
];

const OUTCOME_STATES = [
  "pending",
  "completed",
  "no_show",
  "not_qualified",
];

const SCHEDULE_STATES = ["scheduled", "rescheduled", "cancelled"];
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
    close() {
      database.close();
    },

    getPublicBookingPayload(slug) {
      const bookingLink = this.getBookingLinkBySlug(slug);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      const client = this.getClient(bookingLink.clientId);
      const routingPolicy = this.getRoutingPolicy(bookingLink.id);
      const reps = this.getRepsForLink(bookingLink.id).map((rep) =>
        decorateRep(rep, this.getConnection(rep.id), provider.mode),
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
          providerMode: provider.mode === "nylas" ? "nylas" : "mock",
          reps: reps.map((rep) => ({
            id: rep.id,
            name: rep.name,
            seniority: rep.seniority,
            connectionStatus: rep.connectionStatus,
          })),
        },
        callers: this.listActiveCallers(),
        workspaces: this.listPublicBookingLinks(),
      };
    },

    async listAvailability(slug, companySizeValue, filters = {}) {
      const bookingLink = this.getBookingLinkBySlug(slug);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      return this.buildAvailability(bookingLink, companySizeValue, filters);
    },

    listCallerBookings(slug, callerId) {
      const bookingLink = this.getBookingLinkBySlug(slug);
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
        .map((booking) => this.toBookingSummary(booking));

      const upcomingBookings = bookings
        .filter(
          (booking) =>
            ACTIVE_SCHEDULE_STATES.has(booking.scheduleState) &&
            booking.outcomeState === "pending" &&
            parseISO(booking.startAt) >= new Date(),
        )
        .sort((left, right) => left.startAt.localeCompare(right.startAt));

      const historicalBookings = bookings
        .filter((booking) => !upcomingBookings.some((candidate) => candidate.id === booking.id))
        .sort((left, right) => right.startAt.localeCompare(left.startAt))
        .slice(0, 6);

      return {
        timezone: bookingLink.timezone,
        bookings: [...upcomingBookings, ...historicalBookings],
        tasks: this.listCallerTasks(callerId, bookingLink.clientId).tasks,
      };
    },

    listCallerTasks(callerId, clientId = null) {
      let tasks = this.listAllTasks();
      tasks = tasks.filter(
        (task) =>
          task.callerId === callerId &&
          task.status === "open" &&
          (!clientId || task.clientId === clientId),
      );

      return {
        timezone: "Europe/Paris",
        tasks: tasks.sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
      };
    },

    async buildAvailability(bookingLink, companySizeValue, filters = {}, options = {}) {
      const companySize = Number(companySizeValue);
      if (Number.isNaN(companySize)) {
        throw new Error("Taille d'entreprise invalide.");
      }
      const minimumStart = addMinutes(new Date(), bookingLink.minNoticeMinutes);
      const firstWeekStart = startOfWeek(minimumStart, {
        weekStartsOn: WEEK_STARTS_ON,
      });
      const maximumWindowEnd = endOfWeek(
        addWeeks(firstWeekStart, BOOKING_WINDOW_WEEKS - 1),
        { weekStartsOn: WEEK_STARTS_ON },
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
            weekStartsOn: WEEK_STARTS_ON,
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

      const eligibleReps = this.getEligibleReps(bookingLink.id, companySize);
      const busyByRep = await this.getBusyIntervalsForReps(eligibleReps, interval, {
        excludedBookingId: options.excludedBookingId ?? null,
      });
      const slots = [];
      const client = this.getClient(bookingLink.clientId);
      const policy = this.getRoutingPolicy(bookingLink.id);
      const seniorityPool =
        client?.routingMode === "weighted_seniority" &&
        companySize >= (policy?.companySizeThreshold ?? 200)
          ? "senior"
          : "all";

      for (const day of eachDayOfInterval({ start: windowStart, end: windowEnd })) {
        const weekday = getDay(day);
        if (weekday === 0 || weekday === 6) {
          continue;
        }

        for (let hour = 9; hour < 18; hour += 1) {
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

    async createBooking(slug, payload) {
      const bookingLink = this.getBookingLinkBySlug(slug);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      const caller = this.getCaller(payload.callerId);
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
        ? this.getTask(payload.sourceTaskId)
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
          const freshLink = this.getBookingLinkBySlug(slug);
          if (!freshLink) {
            throw new Error("Booking link introuvable.");
          }

          const availableEligibleReps = await this.getAvailableEligibleRepsForSlot(
            freshLink,
            companySize,
            slotStart,
          );

          if (availableEligibleReps.length === 0) {
            throw new Error("Le créneau sélectionné n'est plus disponible.");
          }

          const assignment = this.assignRep(
            freshLink,
            companySize,
            slotStart,
            availableEligibleReps,
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
          externalEventId = await provider.createExternalEvent(this, assignment.rep, booking);

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

          this.insertLegacyStatusHistory({
            bookingId: booking.id,
            fromStatus: null,
            toStatus: "booked",
            actorType: "caller",
            actorLabel: caller.name,
            reason: "Booking créé depuis le workspace caller.",
            createdAt,
          });

          this.insertTimelineEvent({
            bookingId: booking.id,
            type: "booking_created",
            actorLabel: caller.name,
            reason: "Booking créé depuis le workspace caller.",
            createdAt,
          });

          if (sourceTask) {
            this.completeTask(sourceTask.id, booking.id, createdAt);
          }

          return {
            bookingId: booking.id,
            assignedRepName: assignment.rep.name,
            slug: freshLink.slug,
            clientId: freshLink.clientId,
          };
        });

        this.broadcastAvailability(result.slug);
        this.broadcastAdmin("booking.updated");
        this.broadcastAdmin("task.updated");
        return {
          bookingId: result.bookingId,
          assignedRepName: result.assignedRepName,
        };
      } catch (error) {
        if (externalEventId && repForCleanup) {
          try {
            await provider.releaseExternalEvent(this, {
              assignedRepId: repForCleanup.id,
              externalEventId,
            });
          } catch {
            // Best effort cleanup only.
          }
        }
        throw error;
      }
    },

    listAdminBookings(filters = {}) {
      const bookings = this.filterBookings(this.listAllBookings(), filters);
      const counts = blankStatusCounts();
      bookings.forEach((booking) => {
        counts[getDisplayStatus(booking)] += 1;
      });

      const allReps = this.listAllReps().map((rep) =>
        decorateRep(rep, this.getConnection(rep.id), provider.mode),
      );
      const tasks = this.filterTasks(this.listAllTasks(), filters);

      return {
        timezone: "Europe/Paris",
        counts,
        openTaskCount: tasks.filter((task) => task.status === "open").length,
        clientStats: this.getClientStats(bookings, tasks),
        bookings: bookings.map((booking) => this.toBookingSummary(booking)),
        filters: {
          clients: this.listAllClients().map((client) => ({
            id: client.id,
            name: client.name,
            connectionInviteToken: client.connectionInviteToken,
          })),
          callers: this.listAllCallers().map((caller) => ({
            id: caller.id,
            name: caller.name,
          })),
          reps: allReps.map((rep) => ({
            id: rep.id,
            clientId: rep.clientId,
            name: rep.name,
            clientName: this.getClient(rep.clientId)?.name ?? "Client inconnu",
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
          statuses: DISPLAY_STATUSES,
        },
        integrations: provider.getOverview(),
      };
    },

    listAdminCalendar(filters = {}) {
      const from = filters.from ?? startOfToday().toISOString();
      const to = filters.to ?? endOfDay(addDays(startOfToday(), 6)).toISOString();
      const entries = this.filterBookings(this.listAllBookings(), {
        ...filters,
        from,
        to,
      }).map((booking) => this.toBookingSummary(booking));

      return {
        timezone: "Europe/Paris",
        from,
        to,
        entries,
      };
    },

    listAdminTasks(filters = {}) {
      const tasks = this.filterTasks(this.listAllTasks(), filters);
      return {
        timezone: "Europe/Paris",
        tasks,
      };
    },

    getBookingDetail(bookingId) {
      const booking = this.getBooking(bookingId);
      if (!booking) {
        throw new Error("Booking introuvable.");
      }

      const caller = this.getCaller(booking.callerId);
      const rep = this.getRep(booking.assignedRepId);
      const client = this.getClient(booking.clientId);
      const linkedTask = this.getOpenTaskByBookingId(booking.id) ?? this.getTaskByReplacement(booking.id);

      return {
        booking: {
          id: booking.id,
          displayStatus: getDisplayStatus(booking),
          scheduleState: booking.scheduleState,
          outcomeState: booking.outcomeState,
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
              (repId) => this.getRep(repId)?.name ?? repId,
            ),
          },
          externalEventId: booking.externalEventId ?? "",
          linkedTask,
        },
        timeline: this.getTimelineForBooking(bookingId),
      };
    },

    async listBookingRescheduleAvailability(bookingId, filters = {}) {
      const booking = this.getBooking(bookingId);
      if (!booking) {
        throw new Error("Booking introuvable.");
      }

      const bookingLink = this.getBookingLinkById(booking.bookingLinkId);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      const fallbackWeekStart = startOfWeek(parseISO(booking.startAt), {
        weekStartsOn: WEEK_STARTS_ON,
      });

      return this.buildAvailability(
        bookingLink,
        booking.companySize,
        {
          from: filters.from ?? fallbackWeekStart.toISOString(),
          to:
            filters.to ??
            endOfWeek(fallbackWeekStart, {
              weekStartsOn: WEEK_STARTS_ON,
            }).toISOString(),
        },
        {
          excludedBookingId: booking.id,
          includeRepDetails: true,
        },
      );
    },

    async updateBookingOutcome(bookingId, outcomeState, reason = "") {
      if (!OUTCOME_STATES.includes(outcomeState)) {
        throw new Error("Outcome invalide.");
      }

      const booking = this.getBooking(bookingId);
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

        this.insertLegacyStatusHistory({
          bookingId,
          fromStatus: getLegacyStatus(booking),
          toStatus: getLegacyStatus(next),
          actorType: "admin",
          actorLabel: "Admin BeeNice",
          reason,
          createdAt,
        });

        this.insertTimelineEvent({
          bookingId,
          type: "outcome_set",
          actorLabel: "Admin BeeNice",
          reason: reason || `Résultat mis à jour: ${outcomeState}.`,
          createdAt,
          meta: { outcomeState },
        });

        if (outcomeState === "no_show") {
          this.ensureFollowUpTask(bookingId, "no_show", createdAt);
        }
      });

      this.broadcastAdmin("booking.updated");
      this.broadcastAdmin("task.updated");
      return { ok: true };
    },

    async updateBookingSchedule(bookingId, scheduleState, reason = "", nextStartAt = null) {
      if (!SCHEDULE_STATES.includes(scheduleState)) {
        throw new Error("Statut calendrier invalide.");
      }

      const booking = this.getBooking(bookingId);
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

        const bookingLink = this.getBookingLinkById(booking.bookingLinkId);
        if (!bookingLink) {
          throw new Error("Booking link introuvable.");
        }

        const nextStart = parseISO(nextStartAt);
        if (Number.isNaN(nextStart.getTime())) {
          throw new Error("Nouvelle date invalide.");
        }

        const availableEligibleReps = await this.getAvailableEligibleRepsForSlot(
          bookingLink,
          booking.companySize,
          nextStart,
          {
            excludedBookingId: booking.id,
          },
        );

        if (availableEligibleReps.length === 0) {
          throw new Error("Le créneau sélectionné n'est plus disponible.");
        }

        assignment = this.assignRep(
          bookingLink,
          booking.companySize,
          nextStart,
          availableEligibleReps,
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
        await provider.releaseExternalEvent(this, booking);
      }

      if (scheduleState === "rescheduled" && assignment) {
        externalEventId = await this.replaceExternalEventForReschedule(
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

        this.insertLegacyStatusHistory({
          bookingId,
          fromStatus: getLegacyStatus(booking),
          toStatus: getLegacyStatus(nextBooking),
          actorType: "admin",
          actorLabel: "Admin BeeNice",
          reason,
          createdAt,
        });

        this.insertTimelineEvent({
          bookingId,
          type:
            scheduleState === "cancelled"
              ? "calendar_cancelled"
              : "calendar_rescheduled",
          actorLabel: "Admin BeeNice",
          reason:
            reason ||
            (scheduleState === "cancelled"
              ? "Rendez-vous annulé."
              : "Rendez-vous déplacé manuellement."),
          createdAt,
          meta:
            scheduleState === "rescheduled" && nextStartAt
              ? {
                  previousStartAt: booking.startAt,
                  nextStartAt: patch.startAt,
                  previousRepId: booking.assignedRepId,
                  nextRepId: nextBooking.assignedRepId,
                }
              : undefined,
        });

        if (scheduleState === "cancelled") {
          this.ensureFollowUpTask(bookingId, "cancelled", createdAt);
        }
      });

      const link = this.getBookingLinkById(booking.bookingLinkId);
      if (link) {
        this.broadcastAvailability(link.slug);
      }
      this.broadcastAdmin("booking.updated");
      this.broadcastAdmin("task.updated");
      return { ok: true };
    },

    updateTask(taskId, payload = {}) {
      const task = this.getTask(taskId);
      if (!task) {
        throw new Error("Tâche introuvable.");
      }

      const createdAt = new Date().toISOString();
      const nextStatus = payload.status ?? task.status;
      const dueAt = payload.dueAt ?? task.dueAt;
      if (!["open", "done", "dismissed"].includes(nextStatus)) {
        throw new Error("Statut de tâche invalide.");
      }

      database.withTransaction(() => {
        db.prepare(`
          UPDATE follow_up_tasks
          SET status = ?,
              due_at = ?,
              notes = ?,
              completed_at = ?,
              dismissed_at = ?
          WHERE id = ?
        `).run(
          nextStatus,
          dueAt,
          payload.notes ?? task.notes ?? null,
          nextStatus === "done" ? createdAt : task.completedAt,
          nextStatus === "dismissed" ? createdAt : task.dismissedAt,
          taskId,
        );

        if (nextStatus !== task.status) {
          this.insertTimelineEvent({
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

      this.broadcastAdmin("task.updated");
      return { ok: true };
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

    async connectRep(repId, payload) {
      return this.startRepConnection(repId, payload);
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
      const reps = this.getRepsForLink(bookingLinkId);
      const bookingLink = this.getBookingLinkById(bookingLinkId);
      const client = bookingLink ? this.getClient(bookingLink.clientId) : null;
      const policy = this.getRoutingPolicy(bookingLinkId);
      if (!policy || client?.routingMode !== "weighted_seniority") {
        return reps;
      }
      if (companySize >= policy.companySizeThreshold) {
        return reps.filter((rep) => rep.seniority === "senior");
      }
      return reps;
    },

    async getBusyIntervalsForReps(reps, interval, options = {}) {
      const entries = await Promise.all(
        reps.map(async (rep) => [
          rep.id,
          await this.getBusyIntervals(rep.id, interval, options),
        ]),
      );
      return new Map(entries);
    },

    async getBusyIntervals(repId, interval, options = {}) {
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

      const rep = this.getRep(repId);
      const connection = this.getConnection(repId);
      const providerBusy =
        rep && connection
          ? await provider.listBusyIntervals(this, rep, connection, interval)
          : [];

      return [...localCalendarBusy, ...bookingBusy, ...providerBusy];
    },

    async getAvailableEligibleRepsForSlot(bookingLink, companySize, slotStart, options = {}) {
      const eligibleReps = this.getEligibleReps(bookingLink.id, companySize);
      const interval = {
        start: subMinutes(slotStart, bookingLink.bufferBeforeMinutes),
        end: addMinutes(
          addMinutes(slotStart, bookingLink.durationMinutes),
          bookingLink.bufferAfterMinutes,
        ),
      };
      const busyByRep = await this.getBusyIntervalsForReps(eligibleReps, interval, {
        excludedBookingId: options.excludedBookingId ?? null,
      });
      return eligibleReps.filter((rep) =>
        isRepAvailableAgainstIntervals(
          busyByRep.get(rep.id) ?? [],
          slotStart,
          bookingLink,
        ),
      );
    },

    assignRep(bookingLink, companySize, _slotStart, eligibleReps) {
      if (eligibleReps.length === 0) {
        throw new Error("Aucun rep disponible pour ce créneau.");
      }

      const client = this.getClient(bookingLink.clientId);
      const policy = this.getRoutingPolicy(bookingLink.id);
      if (!policy || client?.routingMode !== "weighted_seniority") {
        const rep = [...eligibleReps].sort((left, right) => {
          const loadDelta =
            this.getRepRollingLoad(left.id, bookingLink.id) -
            this.getRepRollingLoad(right.id, bookingLink.id);
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

      const counts = this.getRollingCounts(bookingLink.id);
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
          this.getRepRollingLoad(left.id, bookingLink.id) -
          this.getRepRollingLoad(right.id, bookingLink.id);
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
    },

    getRollingCounts(bookingLinkId) {
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
        const rep = this.getRep(row.assigned_rep_id);
        if (rep && Object.hasOwn(counts, rep.seniority)) {
          counts[rep.seniority] += 1;
        }
      });
      return counts;
    },

    getRepRollingLoad(repId, bookingLinkId) {
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

    _taskBaseQuery(whereClause = "") {
      return db.prepare(`
        SELECT t.*, b.company_name, b.prospect_name, b.start_at, c.name AS client_name, u.name AS caller_name
        FROM follow_up_tasks t
        JOIN bookings b ON b.id = t.source_booking_id
        JOIN clients c ON c.id = t.client_id
        JOIN callers u ON u.id = t.caller_id
        ${whereClause}
      `);
    },

    listAllTasks() {
      return this._taskBaseQuery("ORDER BY t.due_at ASC, t.created_at DESC")
        .all()
        .map(fromTaskRow);
    },

    getTask(taskId) {
      const row = this._taskBaseQuery("WHERE t.id = ?").get(taskId);
      return row ? fromTaskRow(row) : null;
    },

    getOpenTaskByBookingId(bookingId) {
      const row = this._taskBaseQuery("WHERE t.source_booking_id = ? AND t.status = 'open'").get(bookingId);
      return row ? fromTaskRow(row) : null;
    },

    getTaskByReplacement(bookingId) {
      const row = this._taskBaseQuery("WHERE t.replacement_booking_id = ?").get(bookingId);
      return row ? fromTaskRow(row) : null;
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
    },

    toBookingSummary(booking) {
      return {
        id: booking.id,
        displayStatus: getDisplayStatus(booking),
        scheduleState: booking.scheduleState,
        outcomeState: booking.outcomeState,
        clientId: booking.clientId,
        clientName: this.getClient(booking.clientId)?.name ?? "Client inconnu",
        companyName: booking.companyName,
        companySize: booking.companySize,
        prospectName: booking.prospectName,
        prospectEmail: booking.prospectEmail,
        callerId: booking.callerId,
        callerName: this.getCaller(booking.callerId)?.name ?? "Caller inconnu",
        assignedRepId: booking.assignedRepId,
        assignedRepName: this.getRep(booking.assignedRepId)?.name ?? "Rep inconnu",
        startAt: booking.startAt,
        endAt: booking.endAt,
        originalStartAt: booking.originalStartAt,
        previousStartAt: booking.previousStartAt,
        timezone: booking.timezone,
        notes: booking.notes,
        taskId: this.getOpenTaskByBookingId(booking.id)?.id ?? null,
        canCancel: this.getCallerCancelMode(booking) === "direct",
        cancelMode: this.getCallerCancelMode(booking),
      };
    },

    getCallerCancelMode(booking) {
      if (
        !ACTIVE_SCHEDULE_STATES.has(booking.scheduleState) ||
        booking.outcomeState !== "pending"
      ) {
        return null;
      }

      if (parseISO(booking.startAt) <= new Date()) {
        return null;
      }

      if (provider.mode !== "nylas") {
        return "direct";
      }

      const connection = this.getConnection(booking.assignedRepId);
      if (!connection || connection.status !== "connected") {
        return "admin_only";
      }

      return "direct";
    },

    getClientStats(bookings, tasks) {
      const byClient = new Map();
      bookings.forEach((booking) => {
        if (!byClient.has(booking.clientId)) {
          const client = this.getClient(booking.clientId);
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
        entry.byStatus[getDisplayStatus(booking)] += 1;
      });

      tasks.forEach((task) => {
        if (!byClient.has(task.clientId)) {
          const client = this.getClient(task.clientId);
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
                ((entry.byStatus.no_show + entry.byStatus.cancelled) /
                  entry.total) *
                  100,
              )
            : 0,
        pendingCount: entry.byStatus.scheduled + entry.byStatus.rescheduled,
        openTaskCount: entry.openTaskCount,
      }));
    },

    filterBookings(bookings, filters = {}) {
      return bookings.filter((booking) => {
        if (filters.status && filters.status !== "all") {
          if (getDisplayStatus(booking) !== filters.status) {
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
          const clientName = this.getClient(booking.clientId)?.name ?? "";
          const callerName = this.getCaller(booking.callerId)?.name ?? "";
          const repName = this.getRep(booking.assignedRepId)?.name ?? "";
          if (!matchesQuery(filters.query, [booking.companyName, booking.prospectName, clientName, callerName, repName])) {
            return false;
          }
        }
        return true;
      });
    },

    filterTasks(tasks, filters = {}) {
      return tasks.filter((task) => {
        if (filters.callerId && filters.callerId !== "all" && task.callerId !== filters.callerId) {
          return false;
        }
        if (filters.clientId && filters.clientId !== "all" && task.clientId !== filters.clientId) {
          return false;
        }
        if (filters.query) {
          if (!matchesQuery(filters.query, [task.clientName, task.callerName, task.companyName, task.prospectName])) {
            return false;
          }
        }
        return true;
      });
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
      const current = this.getOpenTaskByBookingId(bookingId);
      if (current) {
        return current;
      }

      const booking = this.getBooking(bookingId);
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

      this.insertTimelineEvent({
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

      return this.getTask(taskId);
    },

    completeTask(taskId, replacementBookingId, createdAt = new Date().toISOString()) {
      const task = this.getTask(taskId);
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

      this.insertTimelineEvent({
        bookingId: task.sourceBookingId,
        type: "task_completed",
        actorLabel: this.getCaller(task.callerId)?.name ?? "BeeNice",
        reason: "Tâche de repositionnement clôturée après rebooking.",
        createdAt,
        meta: { taskId, replacementBookingId },
      });

      return this.getTask(taskId);
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
      const bookingLink = this.getBookingLinkBySlug(slug);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      const caller = this.getCaller(callerId);
      if (!caller || !caller.active) {
        throw new Error("Caller introuvable.");
      }

      const booking = this.getBooking(bookingId);
      if (!booking || booking.bookingLinkId !== bookingLink.id || booking.callerId !== callerId) {
        throw new Error("Booking introuvable pour ce caller.");
      }

      const cancelMode = this.getCallerCancelMode(booking);
      if (cancelMode !== "direct") {
        throw new Error("Annulation directe indisponible. Utilisez la console admin.");
      }

      await provider.releaseExternalEvent(this, booking);

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

        this.insertLegacyStatusHistory({
          bookingId: booking.id,
          fromStatus: getLegacyStatus(booking),
          toStatus: "cancelled",
          actorType: "caller",
          actorLabel: caller.name,
          reason: "Annulation depuis le workspace caller.",
          createdAt,
        });

        this.insertTimelineEvent({
          bookingId: booking.id,
          type: "calendar_cancelled",
          actorLabel: caller.name,
          reason: "Annulation depuis le workspace caller.",
          createdAt,
        });
      });

      this.broadcastAvailability(bookingLink.slug);
      this.broadcastAdmin("booking.updated");
      return {
        bookingId: booking.id,
        releasedSlotStart: booking.startAt,
      };
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

function isRepAvailableAgainstIntervals(intervals, slotStart, bookingLink) {
  const slotEnd = addMinutes(slotStart, bookingLink.durationMinutes);
  const busyStart = subMinutes(slotStart, bookingLink.bufferBeforeMinutes);
  const busyEnd = addMinutes(slotEnd, bookingLink.bufferAfterMinutes);

  return !intervals.some((interval) =>
    rangesOverlap(busyStart, busyEnd, interval.startAt, interval.endAt),
  );
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function matchesQuery(query, fields) {
  const needle = query.toLowerCase();
  const haystack = fields.join(" ").toLowerCase();
  return haystack.includes(needle);
}

function blankStatusCounts() {
  return Object.fromEntries(DISPLAY_STATUSES.map((status) => [status, 0]));
}

function getDisplayStatus(booking) {
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

function getLegacyStatus(booking) {
  const displayStatus = getDisplayStatus(booking);
  switch (displayStatus) {
    case "scheduled":
      return "booked";
    default:
      return displayStatus;
  }
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

function nextBusinessMorning(referenceIso) {
  let cursor = parseISO(referenceIso);
  cursor = addDays(cursor, 1);
  while (isWeekend(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return set(cursor, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }).toISOString();
}

function differenceInMinutesSafe(startIso, endIso) {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
}

function parseOptionalIso(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampDate(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function maxDate(left, right) {
  return left > right ? left : right;
}

function makeId(prefix) {
  return `${prefix}-${randomUUID()}`;
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

function fromTaskRow(row) {
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
    notes: row.notes ?? null,
    sourceStartAt: row.start_at,
  };
}

function parseJson(value, fallback = {}) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
