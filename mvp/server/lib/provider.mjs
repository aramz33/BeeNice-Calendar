import { randomUUID } from "node:crypto";

const DEFAULT_API_URI = process.env.MVP_NYLAS_API_URI ?? "https://api.us.nylas.com";
const CALLBACK_URL =
  process.env.MVP_NYLAS_CALLBACK_URL ??
  "http://localhost:8787/api/admin/integrations/nylas/callback";

export function createCalendarProvider(
  mode = process.env.MVP_CALENDAR_PROVIDER ?? "mock",
) {
  return mode === "nylas" ? createNylasProvider() : createMockProvider();
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

function createMockProvider() {
  return {
    mode: "mock",
    nylasConfigured: true,

    getOverview() {
      return {
        providerMode: "mock",
        nylasConfigured: true,
        callbackUrl: CALLBACK_URL,
        apiUri: DEFAULT_API_URI,
      };
    },

    async startRepConnection(store, repId) {
      const rep = store.getRep(repId);
      if (!rep) throw new Error("Rep introuvable.");

      const connectedAt = new Date().toISOString();
      store.upsertConnection(repId, {
        provider: "mock",
        providerEmail: rep.email,
        providerGrantId: `mock-grant-${rep.id}`,
        providerAccountId: `mock-account-${rep.id}`,
        bookingCalendarId: "primary",
        status: "connected",
        authUrl: null,
        lastSyncAt: connectedAt,
        connectedAt,
        lastWebhookAt: null,
        lastError: null,
      });

      return {
        mode: "mock",
        connected: true,
        authUrl: null,
        connection: store.getConnection(repId),
      };
    },

    async finalizeRepConnection() {
      throw new Error("Le callback Nylas n'est disponible qu'en mode nylas.");
    },

    async listBusyIntervals() {
      return [];
    },

    async createExternalEvent(_store, _rep, booking) {
      return `mock-${booking.id}`;
    },

    async fetchExternalEvent(_store, booking) {
      return {
        id: booking.externalEventId,
        startAt: new Date(booking.startAt),
        endAt: new Date(booking.endAt),
      };
    },

    async releaseExternalEvent() {},
  };
}

// ---------------------------------------------------------------------------
// Nylas provider
// ---------------------------------------------------------------------------

function createNylasProvider() {
  const nylas = {
    apiKey: process.env.MVP_NYLAS_API_KEY ?? "",
    clientId: process.env.MVP_NYLAS_CLIENT_ID ?? "",
    apiUri: DEFAULT_API_URI.replace(/\/$/, ""),
    callbackUrl: CALLBACK_URL,
    webhookSecret: process.env.MVP_NYLAS_WEBHOOK_SECRET ?? "",
  };

  const nylasConfigured = Boolean(nylas.apiKey && nylas.clientId && nylas.callbackUrl);

  return {
    mode: "nylas",
    nylasConfigured,

    getOverview() {
      return {
        providerMode: "nylas",
        nylasConfigured,
        callbackUrl: nylas.callbackUrl,
        apiUri: nylas.apiUri,
      };
    },

    async startRepConnection(store, repId, payload = {}) {
      const rep = store.getRep(repId);
      if (!rep) throw new Error("Rep introuvable.");

      ensureNylasConfigured(nylasConfigured);

      const provider = payload.provider ?? "google";
      const state = encodeState({
        repId,
        provider,
        nonce: randomUUID(),
        source: payload.source ?? "admin",
        inviteToken: payload.inviteToken ?? null,
      });

      const params = new URLSearchParams({
        client_id: nylas.clientId,
        redirect_uri: nylas.callbackUrl,
        response_type: "code",
        access_type: "offline",
        provider,
        state,
      });

      if (rep.email) {
        params.set("login_hint", rep.email);
      }

      const authUrl = `${nylas.apiUri}/v3/connect/auth?${params.toString()}`;
      store.upsertConnection(repId, {
        provider: "nylas",
        providerEmail: null,
        providerGrantId: null,
        providerAccountId: null,
        bookingCalendarId: null,
        status: "auth_required",
        authUrl,
        lastSyncAt: null,
        connectedAt: null,
        lastWebhookAt: null,
        lastError: null,
      });

      return {
        mode: "nylas",
        connected: false,
        authUrl,
        connection: store.getConnection(repId),
      };
    },

    async finalizeRepConnection(store, searchParams) {
      ensureNylasConfigured(nylasConfigured);

      const error = searchParams.get("error");
      if (error) {
        const state = decodeState(searchParams.get("state"));
        if (state?.repId) {
          store.upsertConnection(state.repId, {
            provider: "nylas",
            status: "error",
            lastError: searchParams.get("error_description") ?? error,
          });
        }
        throw new Error(searchParams.get("error_description") ?? error);
      }

      const code = searchParams.get("code");
      const state = decodeState(searchParams.get("state"));
      if (!code || !state?.repId) {
        throw new Error("Réponse Nylas incomplète.");
      }

      const response = await fetch(`${nylas.apiUri}/v3/connect/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: nylas.apiKey,
        },
        body: JSON.stringify({
          code,
          client_id: nylas.clientId,
          client_secret: nylas.apiKey,
          redirect_uri: nylas.callbackUrl,
          grant_type: "authorization_code",
          code_verifier: "nylas",
        }),
      });

      if (!response.ok) {
        const message = await readProviderError(response, "Connexion Nylas refusée.");
        store.upsertConnection(state.repId, {
          provider: "nylas",
          status: "error",
          lastError: message,
        });
        throw new Error(message);
      }

      const payload = await response.json();
      const data = payload?.data ?? payload;

      const claimed = store.claimCalendarConnection(state.repId, {
        providerEmail: data.email ?? data.grant_email ?? null,
        providerGrantId: data.grant_id ?? payload.grant_id ?? null,
        providerAccountId: data.account_id ?? payload.account_id ?? null,
        bookingCalendarId: "primary",
        lastSyncAt: new Date().toISOString(),
      });

      return {
        repId: state.repId,
        provider: state.provider,
        affectedClientIds: claimed.affectedClientIds,
        callbackMode:
          state.source === "public_invite" ? "public_terminal" : "admin_redirect",
      };
    },

    async listBusyIntervals(store, rep, connection, interval) {
      if (connection?.status !== "connected" || !connection?.providerGrantId) {
        return [];
      }

      ensureNylasConfigured(nylasConfigured);

      const params = new URLSearchParams({
        calendar_id: connection.bookingCalendarId ?? "primary",
        start: String(Math.floor(interval.start.getTime() / 1000)),
        end: String(Math.floor(interval.end.getTime() / 1000)),
      });

      const response = await fetch(
        `${nylas.apiUri}/v3/grants/${connection.providerGrantId}/events?${params.toString()}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${nylas.apiKey}`,
          },
        },
      );

      if (!response.ok) {
        const message = await readProviderError(
          response,
          `Impossible de charger la disponibilité de ${rep.name}.`,
        );
        store.upsertConnection(rep.id, {
          provider: "nylas",
          status: "error",
          lastError: message,
        });
        throw new Error(message);
      }

      const payload = await response.json();
      store.upsertConnection(rep.id, {
        provider: "nylas",
        status: "connected",
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });

      return (payload?.data ?? [])
        .map(extractEventInterval)
        .filter(Boolean)
        .map((eventInterval) => ({
          startAt: eventInterval.startAt,
          endAt: eventInterval.endAt,
        }));
    },

    async createExternalEvent(store, rep, booking) {
      ensureNylasConfigured(nylasConfigured);

      const connection = store.getConnection(rep.id);
      if (!connection?.providerGrantId) {
        throw new Error(`Le rep ${rep.name} n'a pas de connexion calendrier active.`);
      }

      const response = await fetch(
        `${nylas.apiUri}/v3/grants/${connection.providerGrantId}/events?calendar_id=${
          connection.bookingCalendarId ?? "primary"
        }`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${nylas.apiKey}`,
          },
          body: JSON.stringify({
            title: `${booking.companyName} · ${booking.prospectName}`,
            description: booking.notes ?? null,
            busy: true,
            participants: [
              {
                name: booking.prospectName,
                email: booking.prospectEmail,
              },
            ],
            when: {
              start_time: Math.floor(new Date(booking.startAt).getTime() / 1000),
              end_time: Math.floor(new Date(booking.endAt).getTime() / 1000),
            },
          }),
        },
      );

      if (!response.ok) {
        const message = await readProviderError(
          response,
          "Création de l'événement Nylas impossible.",
        );
        store.upsertConnection(rep.id, {
          provider: "nylas",
          status: "error",
          lastError: message,
        });
        throw new Error(message);
      }

      const payload = await response.json();
      store.upsertConnection(rep.id, {
        provider: "nylas",
        status: "connected",
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });

      return payload?.data?.id ?? payload?.id ?? `nylas-${booking.id}`;
    },

    async fetchExternalEvent(store, booking) {
      if (!booking.externalEventId) {
        return {
          id: booking.externalEventId,
          startAt: new Date(booking.startAt),
          endAt: new Date(booking.endAt),
        };
      }

      ensureNylasConfigured(nylasConfigured);

      const connection = store.getConnection(booking.assignedRepId);
      if (!connection?.providerGrantId) {
        throw new Error("Connexion calendrier absente pour ce rep.");
      }

      const response = await fetch(
        `${nylas.apiUri}/v3/grants/${connection.providerGrantId}/events/${booking.externalEventId}?calendar_id=${
          connection.bookingCalendarId ?? "primary"
        }`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${nylas.apiKey}`,
          },
        },
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const message = await readProviderError(
          response,
          "Lecture de l'événement calendrier impossible.",
        );
        store.upsertConnection(booking.assignedRepId, {
          provider: "nylas",
          status: "error",
          lastError: message,
        });
        throw new Error(message);
      }

      const payload = await response.json();
      const event = payload?.data ?? payload;
      const interval = extractEventInterval(event);
      if (!interval) return null;

      store.upsertConnection(booking.assignedRepId, {
        provider: "nylas",
        status: "connected",
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });

      return {
        id: event?.id ?? booking.externalEventId,
        startAt: interval.startAt,
        endAt: interval.endAt,
      };
    },

    async releaseExternalEvent(store, booking) {
      if (!booking.externalEventId) return;

      ensureNylasConfigured(nylasConfigured);

      const connection = store.getConnection(booking.assignedRepId);
      if (!connection?.providerGrantId) return;

      const response = await fetch(
        `${nylas.apiUri}/v3/grants/${connection.providerGrantId}/events/${booking.externalEventId}?calendar_id=${
          connection.bookingCalendarId ?? "primary"
        }`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${nylas.apiKey}`,
          },
        },
      );

      if (!response.ok && response.status !== 404) {
        const message = await readProviderError(
          response,
          "Suppression de l'événement Nylas impossible.",
        );
        store.upsertConnection(booking.assignedRepId, {
          provider: "nylas",
          status: "error",
          lastError: message,
        });
        throw new Error(message);
      }

      store.upsertConnection(booking.assignedRepId, {
        provider: "nylas",
        status: "connected",
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Shared utilities (Nylas-only)
// ---------------------------------------------------------------------------

function ensureNylasConfigured(isConfigured) {
  if (!isConfigured) {
    throw new Error(
      "Configuration Nylas incomplète. Renseignez MVP_NYLAS_API_KEY, MVP_NYLAS_CLIENT_ID et MVP_NYLAS_CALLBACK_URL.",
    );
  }
}

function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeState(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function extractEventInterval(event) {
  if (event?.busy === false) return null;

  const when = event?.when ?? {};
  const startSeconds = when.start_time ?? when.startTime ?? when.start;
  const endSeconds = when.end_time ?? when.endTime ?? when.end;

  if (!startSeconds || !endSeconds) return null;

  return {
    startAt: new Date(Number(startSeconds) * 1000),
    endAt: new Date(Number(endSeconds) * 1000),
  };
}

async function readProviderError(response, fallbackMessage) {
  try {
    const payload = await response.json();
    return payload?.error?.message ?? payload?.message ?? payload?.error ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}
