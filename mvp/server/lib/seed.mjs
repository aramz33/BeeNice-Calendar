import { addDays, format, startOfToday } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const TIMEZONE = "Europe/Paris";

function toUtcIso(dayOffset, hours, minutes, durationMinutes = 30) {
  const date = addDays(startOfToday(), dayOffset);
  const day = format(date, "yyyy-MM-dd");
  const start = fromZonedTime(`${day}T${pad(hours)}:${pad(minutes)}:00`, TIMEZONE);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildBusyEvent(id, title, repId, dayOffset, hour, minute, durationMinutes) {
  const { startAt, endAt } = toUtcIso(dayOffset, hour, minute, durationMinutes);
  return {
    id,
    title,
    repId,
    startAt,
    endAt,
    source: "calendar",
  };
}

function buildBooking({
  id,
  bookingLinkId,
  clientId,
  callerId,
  assignedRepId,
  companyName,
  companySize,
  prospectName,
  prospectEmail,
  notes,
  dayOffset,
  hour,
  minute,
  status,
  assignmentReason,
}) {
  const { startAt, endAt } = toUtcIso(dayOffset, hour, minute, 30);
  return {
    id,
    bookingLinkId,
    clientId,
    callerId,
    assignedRepId,
    companyName,
    companySize,
    prospectName,
    prospectEmail,
    notes,
    startAt,
    endAt,
    timezone: TIMEZONE,
    status,
    externalEventId: `mock-event-${id}`,
    assignmentReason,
    createdAt: new Date().toISOString(),
  };
}

export function createSeedState(providerMode = "mock") {
  const client = {
    id: "client-teamstarter",
    name: "TeamStarter",
    timezone: TIMEZONE,
  };

  const callers = [
    { id: "caller-clotilde", name: "Clotilde", active: true },
    { id: "caller-florian", name: "Florian", active: true },
  ];

  const reps = [
    {
      id: "rep-quentin",
      clientId: client.id,
      name: "Quentin Moreau",
      email: "quentin@teamstarter.com",
      seniority: "senior",
      timezone: TIMEZONE,
      active: true,
      sortOrder: 1,
    },
    {
      id: "rep-josette",
      clientId: client.id,
      name: "Josette Martin",
      email: "josette@teamstarter.com",
      seniority: "senior",
      timezone: TIMEZONE,
      active: true,
      sortOrder: 2,
    },
    {
      id: "rep-pierre",
      clientId: client.id,
      name: "Pierre Garnier",
      email: "pierre@teamstarter.com",
      seniority: "junior",
      timezone: TIMEZONE,
      active: true,
      sortOrder: 3,
    },
  ];

  const bookingLink = {
    id: "booking-link-teamstarter",
    clientId: client.id,
    slug: "teamstarter-discovery",
    title: "Discovery call TeamStarter",
    timezone: TIMEZONE,
    durationMinutes: 30,
    intervalMinutes: 30,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    minNoticeMinutes: 60,
    active: true,
  };

  const routingPolicy = {
    id: "routing-teamstarter",
    bookingLinkId: bookingLink.id,
    companySizeThreshold: 200,
    seniorWeight: 0.8,
    juniorWeight: 0.2,
  };

  const repCalendarConnections = reps.map((rep) => ({
    id: `connection-${rep.id}`,
    repId: rep.id,
    provider: providerMode === "nylas" ? "nylas" : "mock",
    providerEmail: providerMode === "mock" ? rep.email : null,
    nylasGrantId: providerMode === "mock" ? `mock-grant-${rep.id}` : null,
    nylasAccountId: providerMode === "mock" ? `mock-account-${rep.id}` : null,
    bookingCalendarId: providerMode === "mock" ? "primary" : null,
    status: providerMode === "mock" ? "connected" : "auth_required",
    authUrl: null,
    lastSyncAt: providerMode === "mock" ? new Date().toISOString() : null,
    lastWebhookAt: null,
    lastError: null,
  }));

  const assignmentBase = {
    companySizeThreshold: routingPolicy.companySizeThreshold,
    seniorityPool: "all",
    chosenRole: "senior",
    roleDeficits: { senior: 0.8, junior: 0.2 },
    candidateRepIds: ["rep-quentin", "rep-josette"],
  };

  const bookings = [
    buildBooking({
      id: "booking-1",
      bookingLinkId: bookingLink.id,
      clientId: client.id,
      callerId: "caller-clotilde",
      assignedRepId: "rep-quentin",
      companyName: "Doctolib",
      companySize: 320,
      prospectName: "Anne Durand",
      prospectEmail: "anne@doctolib.com",
      notes: "Découverte outbound IA + équipe sales France.",
      dayOffset: 1,
      hour: 10,
      minute: 30,
      status: "booked",
      assignmentReason: {
        ...assignmentBase,
        seniorityPool: "senior",
        candidateRepIds: ["rep-quentin", "rep-josette"],
      },
    }),
    buildBooking({
      id: "booking-2",
      bookingLinkId: bookingLink.id,
      clientId: client.id,
      callerId: "caller-florian",
      assignedRepId: "rep-pierre",
      companyName: "Alan",
      companySize: 120,
      prospectName: "Romain Petit",
      prospectEmail: "romain@alan.com",
      notes: "Lead chaud, intéressé par un benchmark acquisition.",
      dayOffset: -1,
      hour: 14,
      minute: 0,
      status: "completed",
      assignmentReason: {
        ...assignmentBase,
        chosenRole: "junior",
        roleDeficits: { senior: -0.2, junior: 0.9 },
        candidateRepIds: ["rep-pierre"],
      },
    }),
    buildBooking({
      id: "booking-3",
      bookingLinkId: bookingLink.id,
      clientId: client.id,
      callerId: "caller-clotilde",
      assignedRepId: "rep-josette",
      companyName: "Spendesk",
      companySize: 280,
      prospectName: "Lucie Meyer",
      prospectEmail: "lucie@spendesk.com",
      notes: "Le prospect n'a pas répondu au call Teams.",
      dayOffset: -2,
      hour: 11,
      minute: 0,
      status: "no_show",
      assignmentReason: {
        ...assignmentBase,
        seniorityPool: "senior",
      },
    }),
    buildBooking({
      id: "booking-4",
      bookingLinkId: bookingLink.id,
      clientId: client.id,
      callerId: "caller-florian",
      assignedRepId: "rep-quentin",
      companyName: "Qonto",
      companySize: 90,
      prospectName: "Mélanie Vidal",
      prospectEmail: "melanie@qonto.com",
      notes: "Annulation côté client, à replacer rapidement.",
      dayOffset: 2,
      hour: 15,
      minute: 0,
      status: "cancelled",
      assignmentReason: {
        ...assignmentBase,
        chosenRole: "senior",
        candidateRepIds: ["rep-quentin", "rep-josette", "rep-pierre"],
      },
    }),
    buildBooking({
      id: "booking-5",
      bookingLinkId: bookingLink.id,
      clientId: client.id,
      callerId: "caller-clotilde",
      assignedRepId: "rep-pierre",
      companyName: "Pennylane",
      companySize: 80,
      prospectName: "Julie Marchand",
      prospectEmail: "julie@pennylane.com",
      notes: "Compte finalement hors ICP.",
      dayOffset: 0,
      hour: 16,
      minute: 0,
      status: "not_qualified",
      assignmentReason: {
        ...assignmentBase,
        chosenRole: "junior",
        roleDeficits: { senior: 0.2, junior: 0.7 },
        candidateRepIds: ["rep-pierre"],
      },
    }),
  ];

  const bookingStatusHistory = [
    history("history-1", "booking-1", null, "booked", "Workspace caller"),
    history("history-2", "booking-2", null, "booked", "Workspace caller"),
    history("history-3", "booking-2", "booked", "completed", "Admin Be Nice", "Rendez-vous mené par le rep."),
    history("history-4", "booking-3", null, "booked", "Workspace caller"),
    history("history-5", "booking-3", "booked", "no_show", "Admin Be Nice", "Prospect absent."),
    history("history-6", "booking-4", null, "booked", "Workspace caller"),
    history("history-7", "booking-4", "booked", "cancelled", "Admin Be Nice", "Prospect a annulé."),
    history("history-8", "booking-5", null, "booked", "Workspace caller"),
    history(
      "history-9",
      "booking-5",
      "booked",
      "not_qualified",
      "Admin Be Nice",
      "Lead non qualifié après call de découverte.",
    ),
  ];

  const calendarEvents =
    providerMode === "mock"
      ? [
          buildBusyEvent("evt-q-1", "Démo client", "rep-quentin", 0, 10, 0, 60),
          buildBusyEvent("evt-q-2", "Forecast", "rep-quentin", 1, 14, 0, 60),
          buildBusyEvent("evt-j-1", "Point équipe", "rep-josette", 0, 9, 30, 30),
          buildBusyEvent("evt-j-2", "Comité de pilotage", "rep-josette", 2, 11, 0, 60),
          buildBusyEvent("evt-p-1", "Onboarding", "rep-pierre", 0, 15, 0, 30),
          buildBusyEvent("evt-p-2", "Démo produit", "rep-pierre", 1, 10, 30, 60),
        ]
      : [];

  return {
    clients: [client],
    callers,
    reps,
    bookingLinks: [bookingLink],
    routingPolicies: [routingPolicy],
    repCalendarConnections,
    bookings,
    bookingStatusHistory,
    calendarEvents,
  };
}

function history(id, bookingId, fromStatus, toStatus, actorLabel, reason) {
  return {
    id,
    bookingId,
    fromStatus,
    toStatus,
    actorLabel,
    reason,
    createdAt: new Date().toISOString(),
  };
}
