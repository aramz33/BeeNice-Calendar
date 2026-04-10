export type BookingStatus =
  | "booked"
  | "completed"
  | "no_show"
  | "cancelled"
  | "rescheduled"
  | "not_qualified";

export interface Caller {
  id: string;
  name: string;
  active: boolean;
}

export interface BookingLinkResponse {
  bookingLink: {
    id: string;
    slug: string;
    title: string;
    clientName: string;
    timezone: string;
    durationMinutes: number;
    intervalMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    companySizeThreshold: number;
    providerMode: "mock" | "nylas";
    reps: Array<{
      id: string;
      name: string;
      seniority: "senior" | "junior";
      connectionStatus: string;
    }>;
  };
  callers: Caller[];
}

export interface AvailabilityResponse {
  timezone: string;
  slots: Array<{
    startAt: string;
    endAt: string;
    availableRepCount: number;
    seniorityPool: "all" | "senior";
  }>;
}

export interface CallerBookingsResponse {
  timezone: string;
  bookings: Array<{
    id: string;
    status: BookingStatus;
    companyName: string;
    prospectName: string;
    startAt: string;
    assignedRepName: string;
  }>;
}

export interface BookingSummary {
  id: string;
  status: BookingStatus;
  companyName: string;
  prospectName: string;
  callerName: string;
  assignedRepName: string;
  startAt: string;
  timezone: string;
  notes?: string;
}

export interface ClientStat {
  clientId: string;
  clientName: string;
  total: number;
  byStatus: Record<BookingStatus, number>;
  completedPct: number;
  noShowPct: number;
  toReplacePct: number;
  pendingCount: number;
}

export interface AdminBookingsResponse {
  timezone: string;
  counts: Record<BookingStatus, number>;
  clientStats: ClientStat[];
  bookings: BookingSummary[];
  filters: {
    clients: Array<{ id: string; name: string }>;
    callers: Array<{ id: string; name: string }>;
    reps: Array<{
      id: string;
      name: string;
      seniority: "senior" | "junior";
      connectionStatus: string;
      provider: string;
      providerEmail?: string | null;
      lastSyncAt?: string | null;
      lastWebhookAt?: string | null;
      lastError?: string | null;
    }>;
    statuses: BookingStatus[];
  };
  integrations: {
    providerMode: "mock" | "nylas";
    nylasConfigured: boolean;
    callbackUrl?: string;
    apiUri?: string;
  };
}

export interface BookingDetailResponse {
  booking: {
    id: string;
    status: BookingStatus;
    companyName: string;
    companySize: number;
    prospectName: string;
    prospectEmail: string;
    callerName: string;
    callerId: string;
    assignedRepName: string;
    assignedRepId: string;
    notes?: string;
    startAt: string;
    endAt: string;
    timezone: string;
    assignmentReason: {
      companySizeThreshold: number;
      seniorityPool: "all" | "senior";
      chosenRole: "senior" | "junior";
      roleDeficits: Record<string, number>;
      candidateRepIds: string[];
    };
    externalEventId: string;
  };
  history: Array<{
    id: string;
    fromStatus: BookingStatus | null;
    toStatus: BookingStatus;
    actorLabel: string;
    reason?: string;
    createdAt: string;
  }>;
}

export interface StartRepConnectionResponse {
  mode: "mock" | "nylas";
  connected: boolean;
  authUrl: string | null;
  connection: {
    id: string;
    repId: string;
    provider: string;
    providerEmail?: string | null;
    status: string;
    lastSyncAt?: string | null;
    lastWebhookAt?: string | null;
    lastError?: string | null;
  };
}
