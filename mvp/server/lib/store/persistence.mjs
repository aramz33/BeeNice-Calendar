import {makeId, parseJson} from "../utils.mjs";

export function createPersistenceAdapter(db) {
    return {
        fromBookingRow,

        ensureDefaultClientArtifacts(defaults) {
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
                const bookingLink = buildDefaultBookingLink(db, client, defaults);
                insertBookingLink(db, bookingLink);
                insertRoutingPolicy(db, buildDefaultRoutingPolicy(bookingLink.id, defaults));
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
                insertRoutingPolicy(db, buildDefaultRoutingPolicy(bookingLink.id, defaults));
            });
        },

        buildDefaultBookingLink(client, defaults) {
            return buildDefaultBookingLink(db, client, defaults);
        },

        buildDefaultRoutingPolicy(bookingLinkId, defaults) {
            return buildDefaultRoutingPolicy(bookingLinkId, defaults);
        },

        toPublicWorkspace,

        insertClient(client) {
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
        },

        updateClient(clientId, patch) {
            db.prepare(`
        UPDATE clients
        SET name = ?,
            timezone = ?,
            routing_mode = ?,
            rep_connection_form_config_json = ?,
            active = ?
        WHERE id = ?
      `).run(
                patch.name,
                patch.timezone,
                patch.routingMode,
                JSON.stringify(patch.repConnectionFormConfig),
                toDbBool(patch.active),
                clientId,
            );
        },

        insertCaller(caller) {
            db.prepare(`
        INSERT INTO callers (id, name, active)
        VALUES (?, ?, ?)
      `).run(caller.id, caller.name, toDbBool(caller.active));
        },

        updateCaller(callerId, patch) {
            db.prepare(`
        UPDATE callers
        SET name = ?,
            active = ?
        WHERE id = ?
      `).run(patch.name, toDbBool(patch.active), callerId);
        },

        getMaxRepSortOrder(clientId) {
            const row = db
                .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM reps WHERE client_id = ?")
                .get(clientId);
            return row?.max_sort_order ?? 0;
        },

        insertRep(rep) {
            db.prepare(`
        INSERT INTO reps (
          id,
          client_id,
          name,
          email,
          seniority,
          timezone,
          active,
          sort_order,
          weight_pct
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
                rep.id,
                rep.clientId,
                rep.name,
                rep.email,
                rep.seniority,
                rep.timezone,
                toDbBool(rep.active),
                rep.sortOrder,
                rep.weightPct ?? null,
            );
        },

        updateRep(repId, patch) {
            db.prepare(`
        UPDATE reps
        SET name = ?,
            email = ?,
            seniority = ?,
            timezone = ?,
            active = ?,
            sort_order = ?,
            weight_pct = ?
        WHERE id = ?
      `).run(
                patch.name,
                patch.email,
                patch.seniority,
                patch.timezone,
                toDbBool(patch.active),
                patch.sortOrder,
                patch.weightPct ?? null,
                repId,
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

        listPublicBookingLinks() {
            return this.listBookingLinks()
                .filter((link) => link.active)
                .map((link) => {
                    const client = this.getClient(link.clientId);
                    if (!client?.active) {
                        return null;
                    }

                    return toPublicWorkspace(link, client);
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

        insertBookingLink(bookingLink) {
            insertBookingLink(db, bookingLink);
        },

        insertRoutingPolicy(policy) {
            insertRoutingPolicy(db, policy);
        },

        getRoutingPolicy(bookingLinkId) {
            const row = db
                .prepare("SELECT * FROM routing_policies WHERE booking_link_id = ?")
                .get(bookingLinkId);
            return row ? fromRoutingPolicyRow(row) : null;
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

        updateProspectRsvpState(bookingId, rsvpState) {
            db.prepare("UPDATE bookings SET prospect_rsvp_state = ? WHERE id = ?")
                .run(rsvpState, bookingId);
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
    };
}

function fromClientRow(row) {
    return {
        id: row.id,
        name: row.name,
        timezone: row.timezone,
        connectionInviteToken: row.connection_invite_token ?? null,
        routingMode: row.routing_mode === "weighted_seniority" ? "weighted_seniority" : "pool_unique",
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
        weightPct: row.weight_pct ?? null,
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
        salutation: row.salutation ?? null,
        prospectFirstName: row.prospect_first_name ?? null,
        prospectLastName: row.prospect_last_name ?? null,
        prospectName: row.prospect_name,
        prospectEmail: row.prospect_email,
        notes: row.notes ?? "",
        startAt: row.start_at,
        endAt: row.end_at,
        timezone: row.timezone,
        status: row.status,
        scheduleState: row.schedule_state ?? "scheduled",
        outcomeState: row.outcome_state ?? "pending",
        prospectRsvpState: row.prospect_rsvp_state ?? "pending",
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

function buildDefaultBookingLink(db, client, defaults) {
    const slug = createUniqueWorkspaceSlug(db, client.name);

    return {
        id: makeId("booking-link"),
        clientId: client.id,
        slug,
        title: `Discovery call ${client.name}`,
        timezone: client.timezone,
        durationMinutes: defaults.workspaceDurationMinutes,
        intervalMinutes: defaults.workspaceIntervalMinutes,
        bufferBeforeMinutes: defaults.workspaceBufferBeforeMinutes,
        bufferAfterMinutes: defaults.workspaceBufferAfterMinutes,
        minNoticeMinutes: defaults.workspaceMinNoticeMinutes,
        active: true,
    };
}

function buildDefaultRoutingPolicy(bookingLinkId, defaults) {
    return {
        id: makeId("routing"),
        bookingLinkId,
        companySizeThreshold: defaults.companySizeThreshold,
        seniorWeight: defaults.seniorWeight,
        juniorWeight: defaults.juniorWeight,
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
