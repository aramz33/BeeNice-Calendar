import { randomUUID } from "node:crypto";
import {
  addDays,
  addMinutes,
  eachDayOfInterval,
  endOfDay,
  getDay,
  parseISO,
  startOfToday,
  subMinutes,
} from "date-fns";
import { createDatabase } from "./database.mjs";

const ACTIVE_BOOKING_STATUSES = new Set([
  "booked",
  "completed",
  "no_show",
  "not_qualified",
]);

const ALL_STATUSES = [
  "booked",
  "completed",
  "no_show",
  "cancelled",
  "rescheduled",
  "not_qualified",
];

export function createStore(provider) {
  const database = createDatabase(provider.mode);
  const { db } = database;
  const sseClients = new Map();

  const store = {
    allStatuses: ALL_STATUSES,
    dbFile: database.filename,

    getPublicBookingPayload(slug) {
      const bookingLink = this.getBookingLinkBySlug(slug);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      const client = this.getClient(bookingLink.clientId);
      const routingPolicy = this.getRoutingPolicy(bookingLink.id);
      const reps = this.getRepsForLink(bookingLink.id).map((rep) =>
        decorateRep(rep, this.getConnection(rep.id)),
      );

      return {
        bookingLink: {
          id: bookingLink.id,
          slug: bookingLink.slug,
          title: bookingLink.title,
          clientName: client?.name ?? "Client inconnu",
          timezone: bookingLink.timezone,
          durationMinutes: bookingLink.durationMinutes,
          intervalMinutes: bookingLink.intervalMinutes,
          bufferBeforeMinutes: bookingLink.bufferBeforeMinutes,
          bufferAfterMinutes: bookingLink.bufferAfterMinutes,
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
      };
    },

    async listAvailability(slug, companySizeValue) {
      const bookingLink = this.getBookingLinkBySlug(slug);
      if (!bookingLink) {
        throw new Error("Booking link introuvable.");
      }

      const companySize = Number(companySizeValue) || 0;
      const interval = {
        start: addMinutes(new Date(), bookingLink.minNoticeMinutes),
        end: endOfDay(addDays(startOfToday(), 6)),
      };

      const eligibleReps = this.getEligibleReps(bookingLink.id, companySize);
      const busyByRep = await this.getBusyIntervalsForReps(eligibleReps, interval);
      const slots = [];

      for (const day of eachDayOfInterval(interval)) {
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
              seniorityPool:
                companySize >= (this.getRoutingPolicy(bookingLink.id)?.companySizeThreshold ?? 200)
                  ? "senior"
                  : "all",
            });
          }
        }
      }

      return {
        timezone: bookingLink.timezone,
        slots,
      };
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
          LIMIT 6
        `)
        .all(bookingLink.id, callerId)
        .map(fromBookingRow)
        .map((booking) => ({
          id: booking.id,
          status: booking.status,
          companyName: booking.companyName,
          prospectName: booking.prospectName,
          startAt: booking.startAt,
          assignedRepName: this.getRep(booking.assignedRepId)?.name ?? "Rep inconnu",
        }));

      return {
        timezone: bookingLink.timezone,
        bookings,
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

      const createdAt = new Date().toISOString();
      const bookingId = makeId("booking");
      const historyId = makeId("history");
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
              external_event_id,
              assignment_reason_json,
              sync_state,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            booking.status,
            externalEventId,
            JSON.stringify(booking.assignmentReason),
            "synced",
            booking.createdAt,
          );

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
            historyId,
            booking.id,
            null,
            "booked",
            "caller",
            caller.name,
            "Booking créé depuis le workspace caller.",
            createdAt,
          );

          return {
            bookingId: booking.id,
            assignedRepName: assignment.rep.name,
            slug: freshLink.slug,
          };
        });

        this.broadcastAvailability(result.slug);
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

    listAdminBookings(filters) {
      let bookings = db
        .prepare("SELECT * FROM bookings ORDER BY start_at DESC")
        .all()
        .map(fromBookingRow);

      if (filters.status) {
        bookings = bookings.filter((booking) => booking.status === filters.status);
      }
      if (filters.callerId) {
        bookings = bookings.filter((booking) => booking.callerId === filters.callerId);
      }
      if (filters.repId) {
        bookings = bookings.filter((booking) => booking.assignedRepId === filters.repId);
      }
      if (filters.query) {
        const query = filters.query.toLowerCase();
        bookings = bookings.filter(
          (booking) =>
            booking.companyName.toLowerCase().includes(query) ||
            booking.prospectName.toLowerCase().includes(query),
        );
      }

      const counts = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0]));
      bookings.forEach((booking) => {
        counts[booking.status] += 1;
      });

      const allReps = this.listAllReps().map((rep) =>
        decorateRep(rep, this.getConnection(rep.id)),
      );

      return {
        timezone: "Europe/Paris",
        counts,
        bookings: bookings.map((booking) => ({
          id: booking.id,
          status: booking.status,
          companyName: booking.companyName,
          prospectName: booking.prospectName,
          callerName: this.getCaller(booking.callerId)?.name ?? "Caller inconnu",
          assignedRepName: this.getRep(booking.assignedRepId)?.name ?? "Rep inconnu",
          startAt: booking.startAt,
          timezone: booking.timezone,
          notes: booking.notes,
        })),
        filters: {
          callers: this.listActiveCallers().map((caller) => ({
            id: caller.id,
            name: caller.name,
          })),
          reps: allReps.map((rep) => ({
            id: rep.id,
            name: rep.name,
            seniority: rep.seniority,
            connectionStatus: rep.connectionStatus,
            provider: rep.provider,
            providerEmail: rep.providerEmail,
            lastSyncAt: rep.lastSyncAt,
            lastWebhookAt: rep.lastWebhookAt,
            lastError: rep.lastError,
          })),
          statuses: ALL_STATUSES,
        },
        integrations: provider.getOverview(),
      };
    },

    getBookingDetail(bookingId) {
      const bookingRow = db
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .get(bookingId);
      if (!bookingRow) {
        throw new Error("Booking introuvable.");
      }

      const booking = fromBookingRow(bookingRow);
      const caller = this.getCaller(booking.callerId);
      const rep = this.getRep(booking.assignedRepId);
      const history = db
        .prepare(`
          SELECT *
          FROM booking_status_history
          WHERE booking_id = ?
          ORDER BY created_at DESC
        `)
        .all(bookingId)
        .map((entry) => ({
          id: entry.id,
          fromStatus: entry.from_status ?? null,
          toStatus: entry.to_status,
          actorLabel: entry.actor_label,
          reason: entry.reason ?? "",
          createdAt: entry.created_at,
        }));

      return {
        booking: {
          id: booking.id,
          status: booking.status,
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
          timezone: booking.timezone,
          assignmentReason: booking.assignmentReason,
          externalEventId: booking.externalEventId ?? "",
        },
        history,
      };
    },

    async updateBookingStatus(bookingId, status, reason = "") {
      if (!ALL_STATUSES.includes(status)) {
        throw new Error("Statut invalide.");
      }

      const booking = this.getBooking(bookingId);
      if (!booking) {
        throw new Error("Booking introuvable.");
      }

      if (booking.status === status) {
        throw new Error("Le booking est déjà dans ce statut.");
      }

      if (status === "cancelled" || status === "rescheduled") {
        await provider.releaseExternalEvent(this, booking);
      }

      await database.withTransaction(() => {
        db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, bookingId);
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
          booking.status,
          status,
          "admin",
          "Admin Be Nice",
          reason || null,
          new Date().toISOString(),
        );
      });

      const link = this.getBookingLinkById(booking.bookingLinkId);
      if (link) {
        this.broadcastAvailability(link.slug);
      }
    },

    async startRepConnection(repId, payload) {
      const result = await provider.startRepConnection(this, repId, payload);
      const rep = this.getRep(repId);
      if (rep && result.connection?.status === "connected") {
        this.broadcastClientAvailability(rep.clientId);
      }
      return result;
    },

    async finalizeRepConnection(searchParams) {
      const result = await provider.finalizeRepConnection(this, searchParams);
      const rep = this.getRep(result.repId);
      if (rep) {
        this.broadcastClientAvailability(rep.clientId);
      }
      return result;
    },

    async connectRep(repId, payload) {
      return this.startRepConnection(repId, payload);
    },

    handleWebhook(payload = {}) {
      const receivedAt = new Date().toISOString();
      const grantId = extractGrantId(payload);

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
          payload.type ?? payload.specversion ?? null,
          extractExternalId(payload),
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

      this.listBookingLinks().forEach((link) => this.broadcastAvailability(link.slug));
      return { ok: true };
    },

    listReps() {
      return this.listAllReps().map((rep) => decorateRep(rep, this.getConnection(rep.id)));
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

    broadcastClientAvailability(clientId) {
      this.listBookingLinksForClient(clientId).forEach((link) =>
        this.broadcastAvailability(link.slug),
      );
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

    getClient(clientId) {
      const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
      return row ? fromClientRow(row) : null;
    },

    listActiveCallers() {
      return db
        .prepare("SELECT * FROM callers WHERE active = 1 ORDER BY name ASC")
        .all()
        .map(fromCallerRow);
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

    getConnection(repId) {
      const row = db
        .prepare("SELECT * FROM rep_calendar_connections WHERE rep_id = ?")
        .get(repId);
      return row ? fromConnectionRow(row) : null;
    },

    upsertConnection(repId, patch) {
      const current =
        db
          .prepare("SELECT * FROM rep_calendar_connections WHERE rep_id = ?")
          .get(repId) ?? null;

      const next = {
        id: current?.id ?? `connection-${repId}`,
        repId,
        provider: patch.provider ?? current?.provider ?? provider.mode,
        providerEmail:
          patch.providerEmail !== undefined
            ? patch.providerEmail
            : current?.provider_email ?? null,
        providerGrantId:
          patch.providerGrantId !== undefined
            ? patch.providerGrantId
            : current?.provider_grant_id ?? null,
        providerAccountId:
          patch.providerAccountId !== undefined
            ? patch.providerAccountId
            : current?.provider_account_id ?? null,
        bookingCalendarId:
          patch.bookingCalendarId !== undefined
            ? patch.bookingCalendarId
            : current?.booking_calendar_id ?? null,
        status: patch.status ?? current?.status ?? "disconnected",
        authUrl: patch.authUrl !== undefined ? patch.authUrl : current?.auth_url ?? null,
        lastSyncAt:
          patch.lastSyncAt !== undefined ? patch.lastSyncAt : current?.last_sync_at ?? null,
        lastWebhookAt:
          patch.lastWebhookAt !== undefined
            ? patch.lastWebhookAt
            : current?.last_webhook_at ?? null,
        lastError:
          patch.lastError !== undefined ? patch.lastError : current?.last_error ?? null,
      };

      if (current) {
        db.prepare(`
          UPDATE rep_calendar_connections
          SET provider = ?,
              provider_email = ?,
              provider_grant_id = ?,
              provider_account_id = ?,
              booking_calendar_id = ?,
              status = ?,
              auth_url = ?,
              last_sync_at = ?,
              last_webhook_at = ?,
              last_error = ?
          WHERE rep_id = ?
        `).run(
          next.provider,
          next.providerEmail,
          next.providerGrantId,
          next.providerAccountId,
          next.bookingCalendarId,
          next.status,
          next.authUrl,
          next.lastSyncAt,
          next.lastWebhookAt,
          next.lastError,
          repId,
        );
      } else {
        db.prepare(`
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
        `).run(
          next.id,
          next.repId,
          next.provider,
          next.providerEmail,
          next.providerGrantId,
          next.providerAccountId,
          next.bookingCalendarId,
          next.status,
          next.authUrl,
          next.lastSyncAt,
          next.lastWebhookAt,
          next.lastError,
        );
      }

      return this.getConnection(repId);
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
          connection?.status === "connected"
        );
      });
    },

    getEligibleReps(bookingLinkId, companySize) {
      const reps = this.getRepsForLink(bookingLinkId);
      const policy = this.getRoutingPolicy(bookingLinkId);
      if (!policy) {
        return reps;
      }
      if (companySize >= policy.companySizeThreshold) {
        return reps.filter((rep) => rep.seniority === "senior");
      }
      return reps;
    },

    async getBusyIntervalsForReps(reps, interval) {
      const entries = await Promise.all(
        reps.map(async (rep) => [
          rep.id,
          await this.getBusyIntervals(rep.id, interval),
        ]),
      );
      return new Map(entries);
    },

    async getBusyIntervals(repId, interval) {
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
            AND status IN ('booked', 'completed', 'no_show', 'not_qualified')
        `)
        .all(repId, interval.start.toISOString(), interval.end.toISOString())
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

    async getAvailableEligibleRepsForSlot(bookingLink, companySize, slotStart) {
      const eligibleReps = this.getEligibleReps(bookingLink.id, companySize);
      const interval = {
        start: subMinutes(slotStart, bookingLink.bufferBeforeMinutes),
        end: addMinutes(
          addMinutes(slotStart, bookingLink.durationMinutes),
          bookingLink.bufferAfterMinutes,
        ),
      };
      const busyByRep = await this.getBusyIntervalsForReps(eligibleReps, interval);
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

      const policy = this.getRoutingPolicy(bookingLink.id);
      const counts = this.getRollingCounts(bookingLink.id);
      const total = counts.senior + counts.junior;
      const deficits = {
        senior: (total + 1) * policy.seniorWeight - counts.senior,
        junior: (total + 1) * policy.juniorWeight - counts.junior,
      };

      const byRole = {
        senior: eligibleReps.filter((rep) => rep.seniority === "senior"),
        junior: eligibleReps.filter((rep) => rep.seniority === "junior"),
      };

      let chosenRole = "senior";
      if (byRole.senior.length === 0) {
        chosenRole = "junior";
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

      const counts = { senior: 0, junior: 0 };
      rows.forEach((row) => {
        const rep = this.getRep(row.assigned_rep_id);
        if (rep) {
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

    getBooking(bookingId) {
      const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
      return row ? fromBookingRow(row) : null;
    },
  };

  return store;
}

function decorateRep(rep, connection) {
  return {
    ...rep,
    connectionStatus: connection?.status ?? "disconnected",
    provider: connection?.provider ?? "mock",
    providerEmail: connection?.providerEmail ?? rep.email,
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

function extractGrantId(payload) {
  return (
    payload?.data?.grant_id ??
    payload?.data?.object?.grant_id ??
    payload?.grant_id ??
    null
  );
}

function extractExternalId(payload) {
  return payload?.data?.id ?? payload?.id ?? payload?.specversion ?? null;
}

function makeId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function fromClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
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

function fromConnectionRow(row) {
  return {
    id: row.id,
    repId: row.rep_id,
    provider: row.provider,
    providerEmail: row.provider_email ?? null,
    providerGrantId: row.provider_grant_id ?? null,
    providerAccountId: row.provider_account_id ?? null,
    bookingCalendarId: row.booking_calendar_id ?? null,
    status: row.status,
    authUrl: row.auth_url ?? null,
    lastSyncAt: row.last_sync_at ?? null,
    lastWebhookAt: row.last_webhook_at ?? null,
    lastError: row.last_error ?? null,
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
    externalEventId: row.external_event_id ?? "",
    assignmentReason: parseJson(row.assignment_reason_json),
    syncState: row.sync_state,
    createdAt: row.created_at,
  };
}

function parseJson(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
