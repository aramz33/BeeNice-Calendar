
const PUBLIC_PROVIDER_OPTIONS = [
  { id: "google", label: "Google" },
  { id: "microsoft", label: "Microsoft" },
];

export function fromConnectionRow(row) {
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
    connectedAt: row.connected_at ?? null,
    lastWebhookAt: row.last_webhook_at ?? null,
    lastError: row.last_error ?? null,
  };
}

export function isConnectionUsable(connection, providerMode) {
  if (!connection || connection.status !== "connected") {
    return false;
  }
  if (providerMode === "nylas") {
    return connection.provider === "nylas" && Boolean(connection.providerGrantId);
  }
  return connection.provider === "mock";
}

export function getEffectiveConnectionStatus(connection, providerMode) {
  if (!connection) {
    return "disconnected";
  }
  if (connection.status !== "connected") {
    return connection.status;
  }
  return isConnectionUsable(connection, providerMode) ? "connected" : "disconnected";
}

function normalizePublicRepConnectionFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .filter((field) => field && typeof field.id === "string" && typeof field.label === "string")
    .map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type === "select" ? "select" : "text",
      required: field.required !== false,
      options:
        field.type === "select" && Array.isArray(field.options)
          ? field.options
              .filter(
                (option) =>
                  option &&
                  typeof option.id === "string" &&
                  typeof option.label === "string",
              )
              .map((option) => ({
                id: option.id,
                label: option.label,
              }))
          : undefined,
    }))
    .filter(
      (field) => !["firstName", "lastName", "provider"].includes(field.id),
    );
}

export function getConnection(db, repId) {
  const row = db
    .prepare("SELECT * FROM rep_calendar_connections WHERE rep_id = ?")
    .get(repId);
  return row ? fromConnectionRow(row) : null;
}

export function findConflictingConnections(db, identity = {}, options = {}) {
  const grantId = identity.providerGrantId ?? null;
  const accountId = identity.providerAccountId ?? null;
  if (!grantId && !accountId) {
    return [];
  }

  return db
    .prepare(`
      SELECT *
      FROM rep_calendar_connections
      WHERE (
        (? IS NOT NULL AND provider_grant_id = ?)
        OR (? IS NOT NULL AND provider_account_id = ?)
      )
        AND (? IS NULL OR rep_id != ?)
    `)
    .all(
      grantId,
      grantId,
      accountId,
      accountId,
      options.excludeRepId ?? null,
      options.excludeRepId ?? null,
    )
    .map(fromConnectionRow);
}

export function upsertConnection(db, provider, repId, patch) {
  const current =
    db
      .prepare("SELECT * FROM rep_calendar_connections WHERE rep_id = ?")
      .get(repId) ?? null;

  const pick = (patchVal, currentVal) =>
    patchVal !== undefined ? patchVal : currentVal ?? null;

  const next = {
    id: current?.id ?? `connection-${repId}`,
    repId,
    provider: patch.provider ?? current?.provider ?? provider.mode,
    providerEmail: pick(patch.providerEmail, current?.provider_email),
    providerGrantId: pick(patch.providerGrantId, current?.provider_grant_id),
    providerAccountId: pick(patch.providerAccountId, current?.provider_account_id),
    bookingCalendarId: pick(patch.bookingCalendarId, current?.booking_calendar_id),
    status: patch.status ?? current?.status ?? "disconnected",
    authUrl: pick(patch.authUrl, current?.auth_url),
    lastSyncAt: pick(patch.lastSyncAt, current?.last_sync_at),
    connectedAt: pick(patch.connectedAt, current?.connected_at),
    lastWebhookAt: pick(patch.lastWebhookAt, current?.last_webhook_at),
    lastError: pick(patch.lastError, current?.last_error),
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
          connected_at = ?,
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
      next.connectedAt,
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
        connected_at,
        last_webhook_at,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      next.connectedAt,
      next.lastWebhookAt,
      next.lastError,
    );
  }

  return getConnection(db, repId);
}

export function disconnectConnection(db, provider, repId, patch = {}) {
  const current = getConnection(db, repId);
  if (!current) {
    return null;
  }

  return upsertConnection(db, provider, repId, {
    provider: patch.provider ?? current.provider ?? provider.mode,
    providerEmail: null,
    providerGrantId: null,
    providerAccountId: null,
    bookingCalendarId: null,
    status: patch.status ?? "disconnected",
    authUrl: null,
    lastSyncAt: null,
    connectedAt: null,
    lastWebhookAt: null,
    lastError: patch.lastError ?? null,
  });
}

export function claimCalendarConnection(database, db, provider, store, repId, patch = {}) {
  const rep = store.getRep(repId);
  if (!rep) {
    throw new Error("Rep introuvable.");
  }

  const connectedAt = patch.connectedAt ?? new Date().toISOString();

  return database.withTransaction(() => {
    const conflicts = findConflictingConnections(
      db,
      {
        providerGrantId: patch.providerGrantId ?? null,
        providerAccountId: patch.providerAccountId ?? null,
      },
      { excludeRepId: repId },
    );
    const affectedClientIds = new Set([rep.clientId]);

    conflicts.forEach((connection) => {
      const owner = store.getRep(connection.repId);
      if (owner) {
        affectedClientIds.add(owner.clientId);
      }
      disconnectConnection(db, provider, connection.repId, { provider: "nylas" });
    });

    const connection = upsertConnection(db, provider, repId, {
      provider: "nylas",
      providerEmail: patch.providerEmail ?? null,
      providerGrantId: patch.providerGrantId ?? null,
      providerAccountId: patch.providerAccountId ?? null,
      bookingCalendarId: patch.bookingCalendarId ?? "primary",
      status: "connected",
      authUrl: null,
      lastSyncAt: patch.lastSyncAt ?? connectedAt,
      connectedAt,
      lastWebhookAt: patch.lastWebhookAt ?? null,
      lastError: patch.lastError ?? null,
    });

    return {
      connection,
      disconnectedRepIds: conflicts.map((item) => item.repId),
      affectedClientIds: [...affectedClientIds],
    };
  });
}

export async function startRepConnection(provider, store, repId, payload) {
  const result = await provider.startRepConnection(store, repId, payload);
  const rep = store.getRep(repId);
  if (rep && result.connection?.status === "connected") {
    store.broadcastClientAvailability(rep.clientId);
  }
  store.broadcastAdmin("connections.updated");
  return result;
}

export async function finalizeRepConnection(provider, store, searchParams) {
  const result = await provider.finalizeRepConnection(store, searchParams);
  const affectedClientIds = new Set(result.affectedClientIds ?? []);
  const rep = store.getRep(result.repId);
  if (rep) {
    affectedClientIds.add(rep.clientId);
  }
  affectedClientIds.forEach((clientId) => store.broadcastClientAvailability(clientId));
  store.broadcastAdmin("connections.updated");
  return result;
}

export function getPublicRepConnectionPayload(store, inviteToken) {
  const client = store.getClientByInviteToken(inviteToken);
  if (!client) {
    throw new Error("Lien de connexion introuvable.");
  }

  return {
    client: {
      id: client.id,
      name: client.name,
      timezone: client.timezone,
      inviteToken: client.connectionInviteToken,
      routingMode: client.routingMode,
    },
    fields: [
      {
        id: "firstName",
        label: "Prénom",
        type: "text",
        required: true,
      },
      {
        id: "lastName",
        label: "Nom",
        type: "text",
        required: true,
      },
      {
        id: "provider",
        label: "Provider calendrier",
        type: "select",
        required: true,
        options: PUBLIC_PROVIDER_OPTIONS,
      },
      ...normalizePublicRepConnectionFields(client.repConnectionFormConfig),
    ],
  };
}

export async function startPublicRepConnection(store, inviteToken, payload = {}) {
  const client = store.getClientByInviteToken(inviteToken);
  if (!client) {
    throw new Error("Lien de connexion introuvable.");
  }

  if (!["google", "microsoft"].includes(payload.provider)) {
    throw new Error("Provider de connexion invalide.");
  }

  if (!payload.firstName?.trim() || !payload.lastName?.trim()) {
    throw new Error("Le prénom et le nom sont obligatoires.");
  }

  const rep = store.findOrCreateRepForPublicConnection(client, payload);

  return store.startRepConnection(rep.id, {
    provider: payload.provider,
    source: "public_invite",
    inviteToken,
  });
}
