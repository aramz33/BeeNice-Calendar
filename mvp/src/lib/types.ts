export type ScheduleState = "scheduled" | "rescheduled" | "cancelled";
export type Seniority = "senior" | "junior" | "non_defini";
export type RoutingMode = "pool_unique" | "weighted_seniority";
export type OutcomeState =
  "pending" | "completed" | "no_show" | "not_qualified" | "refused";
export type DisplayStatus =
  | "scheduled"
  | "completed"
  | "no_show"
  | "cancelled"
  | "rescheduled"
  | "not_qualified"
  | "refused";
export type BookingStatus = DisplayStatus;
export type FollowUpTaskStatus = "open" | "done" | "dismissed";
export type FollowUpTaskTrigger = "no_show" | "cancelled" | "refused";

export interface AssignmentReason {
  routingMode: RoutingMode | "percentage";
  seniorityPool: "all" | "senior";
  candidateRepIds: string[];
  candidateRepNames?: string[];
  effectiveWeights?: Record<string, number>;
  rollingCounts?: Record<string, number>;
  // Legacy weighted_seniority fields, retained for older booking records.
  companySizeThreshold?: number;
  chosenRole?: Seniority | "pool_unique";
  roleDeficits?: Record<string, number> | null;
}

export interface BookingSummary {
  id: string;
  displayStatus: DisplayStatus;
  scheduleState: ScheduleState;
  outcomeState: OutcomeState;
  clientId: string;
  clientName: string;
  companyName: string;
  companySize: number;
  salutation?: string | null;
  prospectFirstName?: string | null;
  prospectLastName?: string | null;
  prospectName: string;
  prospectEmail: string;
  callerId: string;
  callerName: string;
  assignedRepId: string;
  assignedRepName: string;
  startAt: string;
  endAt: string;
  originalStartAt: string;
  previousStartAt?: string | null;
  timezone: string;
  notes?: string;
  taskId?: string | null;
  canCancel?: boolean;
  cancelMode?: "direct" | "admin_only" | null;
}

export interface FollowUpTask {
  id: string;
  sourceBookingId: string;
  clientId: string;
  clientName: string;
  callerId: string;
  callerName: string;
  type: "reposition_booking";
  triggerReason: FollowUpTaskTrigger;
  status: FollowUpTaskStatus;
  dueAt: string;
  createdAt: string;
  completedAt?: string | null;
  dismissedAt?: string | null;
  replacementBookingId?: string | null;
  companyName: string;
  prospectName: string;
  notes?: string;
  sourceStartAt: string;
}

export interface TimelineEvent {
  id: string;
  type:
    | "booking_created"
    | "schedule_set"
    | "calendar_rescheduled"
    | "calendar_cancelled"
    | "outcome_set"
    | "task_created"
    | "task_completed";
  actorLabel: string;
  reason?: string;
  createdAt: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface PublicWorkspace {
  id: string;
  slug: string;
  clientId: string;
  clientName: string;
  title: string;
  timezone: string;
}

export interface CallerWorkspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface CallerWorkspacesResponse {
  workspaces: CallerWorkspace[];
}

export interface CallerTasksResponse {
  tasks: FollowUpTask[];
}

export interface AvailabilityResponse {
  timezone: string;
  windowStart: string;
  windowEnd: string;
  maxWindowEnd: string;
  slots: Array<{
    startAt: string;
    endAt: string;
    availableRepCount: number;
    seniorityPool: "all" | "senior";
    availableRepIds?: string[];
    availableRepNames?: string[];
  }>;
}

export interface CallerBookingsResponse {
  timezone: string;
  bookings: BookingSummary[];
  tasks: FollowUpTask[];
}

export interface ClientStat {
  clientId: string;
  clientName: string;
  total: number;
  byStatus: Record<DisplayStatus, number>;
  completedPct: number;
  noShowPct: number;
  toReplacePct: number;
  pendingCount: number;
  openTaskCount: number;
}

export interface AdminBookingsResponse {
  timezone: string;
  counts: Record<DisplayStatus, number>;
  openTaskCount: number;
  clientStats: ClientStat[];
  bookings: BookingSummary[];
  filters: {
    clients: Array<{
      id: string;
      name: string;
      connectionInviteToken?: string | null;
    }>;
    callers: Array<{ id: string; name: string }>;
    reps: Array<{
      id: string;
      clientId: string;
      name: string;
      clientName: string;
      businessEmail?: string | null;
      weightPct?: number | null;
      connectionStatus: string;
      provider: string;
      providerVendor?: string | null;
      providerEmail?: string | null;
      connectedAt?: string | null;
      lastSyncAt?: string | null;
      lastWebhookAt?: string | null;
      lastError?: string | null;
    }>;
    statuses: DisplayStatus[];
  };
  integrations: {
    providerMode: "mock" | "nylas";
    nylasConfigured: boolean;
    callbackUrl?: string;
    apiUri?: string;
  };
}

export interface AdminRepsResponse {
  reps: AdminBookingsResponse["filters"]["reps"];
  integrations: AdminBookingsResponse["integrations"];
}

export interface AdminCalendarResponse {
  timezone: string;
  from: string;
  to: string;
  entries: BookingSummary[];
}

export interface AdminTasksResponse {
  timezone: string;
  tasks: FollowUpTask[];
}

export interface BookingDetailResponse {
  booking: {
    id: string;
    displayStatus: DisplayStatus;
    scheduleState: ScheduleState;
    outcomeState: OutcomeState;
    clientId: string;
    clientName: string;
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
    originalStartAt: string;
    previousStartAt?: string | null;
    lastCalendarChangeAt?: string | null;
    calendarSyncState: "synced" | "stale" | "error";
    timezone: string;
    assignmentReason: AssignmentReason;
    externalEventId: string;
    linkedTask?: FollowUpTask | null;
  };
  timeline: TimelineEvent[];
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
    connectedAt?: string | null;
    lastSyncAt?: string | null;
    lastWebhookAt?: string | null;
    lastError?: string | null;
  };
}

export interface SettingsPayload {
  clients: Array<{
    id: string;
    name: string;
    timezone: string;
    connectionInviteToken?: string | null;
    routingMode: RoutingMode;
    repConnectionFormConfig: PublicRepConnectionField[];
    primaryContactFirstName: string;
    primaryContactLastName: string;
    primaryContactPhone: string;
    primaryContactEmail: string;
    active: boolean;
  }>;
  callers: Array<{ id: string; name: string; active: boolean }>;
}

export interface ClientCreationResponse {
  client: SettingsPayload["clients"][number];
  workspace: PublicWorkspace;
}

export interface PublicRepConnectionResponse {
  client: {
    id: string;
    name: string;
    timezone: string;
    inviteToken: string;
    routingMode: RoutingMode;
  };
  fields: PublicRepConnectionField[];
}

export interface PublicRepConnectionField {
  id: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  options?: Array<{
    id: string;
    label: string;
  }>;
}
