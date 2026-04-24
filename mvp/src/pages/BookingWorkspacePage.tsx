import { useEffect, useMemo, useState } from "react";
import { addWeeks, endOfWeek, parseISO, startOfWeek, subWeeks } from "date-fns";
import { useNavigate, useParams } from "react-router";
import { CalendarClock, RotateCcw, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@shared-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";
import { Input } from "@shared-ui/input";
import { Label } from "@shared-ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared-ui/select";
import { Textarea } from "@shared-ui/textarea";
import { AppChrome } from "@mvp/components/AppChrome";
import { MetricCard } from "@mvp/components/MetricCard";
import { SlotPicker } from "@mvp/components/SlotPicker";
import { StatusBadge } from "@mvp/components/StatusBadge";
import { apiFetch } from "@mvp/lib/api";
import { formatDateTime, formatRelativeShort } from "@mvp/lib/time";
import type {
  AvailabilityResponse,
  BookingLinkResponse,
  BookingSummary,
  CallerBookingsResponse,
  FollowUpTask,
  PublicWorkspace,
} from "@mvp/lib/types";

const COMPANY_SIZE_OPTIONS = [
  { label: "1 à 49 salariés", value: "49" },
  { label: "50 à 199 salariés", value: "150" },
  { label: "200 à 499 salariés", value: "250" },
  { label: "500+ salariés", value: "500" },
];

const CALLER_STORAGE_KEY = "benice-mvp-caller";
const WEEK_STARTS_ON = 1;
const BOOKING_WINDOW_WEEKS = 12;
const DEMO_WORKSPACES: PublicWorkspace[] = [
  {
    id: "booking-link-teamstarter",
    slug: "teamstarter-discovery",
    clientId: "client-teamstarter",
    clientName: "TeamStarter",
    title: "Discovery call TeamStarter",
    timezone: "Europe/Paris",
  },
  {
    id: "booking-link-doctolib",
    slug: "doctolib-discovery",
    clientId: "client-doctolib",
    clientName: "Doctolib",
    title: "Discovery call Doctolib",
    timezone: "Europe/Paris",
  },
];

export function BookingWorkspacePage() {
  const { slug = "teamstarter-discovery" } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<BookingLinkResponse | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null,
  );
  const [callerBookings, setCallerBookings] =
    useState<CallerBookingsResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(
    null,
  );
  const [callerId, setCallerId] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceTask, setSourceTask] = useState<FollowUpTask | null>(null);
  const [availabilityWeekStartIso, setAvailabilityWeekStartIso] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON }).toISOString(),
  );

  const timezone = payload?.bookingLink.timezone ?? "Europe/Paris";
  const currentWeekStart = useMemo(
    () => parseISO(availabilityWeekStartIso),
    [availabilityWeekStartIso],
  );
  const firstBookableWeekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON }),
    [],
  );
  const lastBookableWeekStart = useMemo(
    () => addWeeks(firstBookableWeekStart, BOOKING_WINDOW_WEEKS - 1),
    [firstBookableWeekStart],
  );
  const hasPreviousAvailabilityWeek = currentWeekStart > firstBookableWeekStart;
  const hasNextAvailabilityWeek = currentWeekStart < lastBookableWeekStart;
  const selectedSlotLabel = selectedSlot
    ? formatDateTime(selectedSlot, timezone)
    : "Aucun créneau sélectionné";

  const tasks = callerBookings?.tasks ?? [];
  const recentBookings = callerBookings?.bookings ?? [];
  const clientName = payload?.bookingLink.clientName ?? "Client";
  const workspaceOptions = useMemo(() => {
    if (payload?.workspaces?.length) {
      return payload.workspaces;
    }

    const currentWorkspace = payload
      ? {
          id: payload.bookingLink.id,
          slug: payload.bookingLink.slug,
          clientId: payload.bookingLink.clientId ?? payload.bookingLink.slug,
          clientName: payload.bookingLink.clientName,
          title: payload.bookingLink.title,
          timezone: payload.bookingLink.timezone,
        }
      : null;

    const merged = currentWorkspace
      ? [
          currentWorkspace,
          ...DEMO_WORKSPACES.filter(
            (workspace) => workspace.slug !== currentWorkspace.slug,
          ),
        ]
      : DEMO_WORKSPACES;

    return merged;
  }, [payload]);

  useEffect(() => {
    let ignore = false;
    setLoadingMeta(true);
    apiFetch<BookingLinkResponse>(`/api/book/${slug}`)
      .then((data) => {
        if (ignore) return;
        setPayload(data);
        const stored = window.localStorage.getItem(CALLER_STORAGE_KEY);
        const firstCaller =
          stored && data.callers.some((caller) => caller.id === stored)
            ? stored
            : (data.callers[0]?.id ?? "");
        setCallerId(firstCaller);
      })
      .catch((error) => toast.error(error.message))
      .finally(() => {
        if (!ignore) setLoadingMeta(false);
      });

    return () => {
      ignore = true;
    };
  }, [slug]);

  useEffect(() => {
    if (callerId) {
      window.localStorage.setItem(CALLER_STORAGE_KEY, callerId);
    }
  }, [callerId]);

  const fetchAvailability = async (
    preferredSlot: string | null = selectedSlot,
    weekStart: Date = currentWeekStart,
    companySizeValue: string = companySize,
  ) => {
    if (!companySizeValue) {
      setAvailability(null);
      setSelectedSlot(null);
      return;
    }

    setLoadingAvailability(true);
    try {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON });
      const params = new URLSearchParams({
        companySize: companySizeValue,
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      const data = await apiFetch<AvailabilityResponse>(
        `/api/book/${slug}/availability?${params.toString()}`,
      );
      setAvailability(data);
      setSelectedSlot(
        preferredSlot && data.slots.some((slot) => slot.startAt === preferredSlot)
          ? preferredSlot
          : null,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const fetchCallerData = async () => {
    if (!callerId) {
      setCallerBookings(null);
      return;
    }

    try {
      const data = await apiFetch<CallerBookingsResponse>(
        `/api/book/${slug}/callers/${callerId}/bookings`,
      );
      setCallerBookings(data);
      setSourceTask((current) =>
        current
          ? (data.tasks.find((task) => task.id === current.id) ?? null)
          : null,
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  useEffect(() => {
    void fetchAvailability();
  }, [slug, companySize, availabilityWeekStartIso]);

  useEffect(() => {
    void fetchCallerData();
  }, [slug, callerId]);

  useEffect(() => {
    const source = new EventSource(`/api/book/${slug}/stream`);
    source.addEventListener("availability.updated", () => {
      void fetchAvailability();
      void fetchCallerData();
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [slug, callerId, companySize, availabilityWeekStartIso]);

  const eligiblePoolLabel = useMemo(() => {
    if (!companySize || !payload) {
      return "Choisissez une tranche";
    }
    return Number(companySize) >= payload.bookingLink.companySizeThreshold
      ? "Pool senior uniquement"
      : "Pool complet";
  }, [companySize, payload]);

  const handleTaskSelect = (task: FollowUpTask) => {
    setSourceTask(task);
    setCompanyName(task.companyName);
    setProspectName(task.prospectName);
    setNotes(task.notes ?? "");
    toast.success("Contexte de repositionnement chargé.");
  };

  const handleWorkspaceChange = (nextSlug: string) => {
    if (nextSlug === slug) {
      return;
    }

    setAvailability(null);
    setSelectedSlot(null);
    setSourceTask(null);
    setAvailabilityWeekStartIso(firstBookableWeekStart.toISOString());
    navigate(`/book/${nextSlug}`);
  };

  const resetTask = () => {
    setSourceTask(null);
    setProspectName("");
    setCompanyName("");
    setNotes("");
  };

  const handlePreviousAvailabilityWeek = () => {
    if (!hasPreviousAvailabilityWeek) {
      return;
    }

    setAvailabilityWeekStartIso(
      subWeeks(currentWeekStart, 1).toISOString(),
    );
  };

  const handleNextAvailabilityWeek = () => {
    if (!hasNextAvailabilityWeek) {
      return;
    }

    setAvailabilityWeekStartIso(
      addWeeks(currentWeekStart, 1).toISOString(),
    );
  };

  const handleCancelBooking = async (booking: BookingSummary) => {
    if (!callerId || booking.cancelMode !== "direct") {
      return;
    }

    setCancellingBookingId(booking.id);
    try {
      const bookingWeekStart = startOfWeek(parseISO(booking.startAt), {
        weekStartsOn: WEEK_STARTS_ON,
      });
      await apiFetch(
        `/api/book/${slug}/callers/${callerId}/bookings/${booking.id}/cancel`,
        {
          method: "POST",
        },
      );

      setSourceTask(null);
      setCompanySize(String(booking.companySize));
      setCompanyName(booking.companyName);
      setProspectName(booking.prospectName);
      setProspectEmail(booking.prospectEmail);
      setNotes(booking.notes ?? "");
      setAvailabilityWeekStartIso(bookingWeekStart.toISOString());
      await Promise.all([
        fetchAvailability(booking.startAt, bookingWeekStart, String(booking.companySize)),
        fetchCallerData(),
      ]);
      toast.success(
        "Rendez-vous annulé. Le créneau a été rechargé pour corriger l’email ou rebooker.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCancellingBookingId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSlot) {
      toast.error("Choisissez un créneau avant de réserver.");
      return;
    }
    if (
      !callerId ||
      !companySize ||
      !prospectName ||
      !prospectEmail ||
      !companyName
    ) {
      toast.error("Complétez les informations prospect obligatoires.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<{
        bookingId: string;
        assignedRepName: string;
      }>(`/api/book/${slug}/bookings`, {
        method: "POST",
        body: JSON.stringify({
          callerId,
          companySize: Number(companySize),
          companyName,
          prospectName,
          prospectEmail,
          notes,
          slotStart: selectedSlot,
          sourceTaskId: sourceTask?.id ?? null,
        }),
      });

      toast.success(`Rendez-vous réservé chez ${result.assignedRepName}.`);
      setProspectName("");
      setProspectEmail("");
      setCompanyName("");
      setNotes("");
      setSelectedSlot(null);
      setSourceTask(null);
      await Promise.all([fetchAvailability(), fetchCallerData()]);
    } catch (error) {
      toast.error((error as Error).message);
      await fetchAvailability();
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingMeta || !payload) {
    return (
      <AppChrome title="Chargement du workspace caller">
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="surface-card h-52 animate-pulse" />
          ))}
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title={`Workspace caller · ${clientName}`}>
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Callers actifs"
          value={payload.callers.length}
          helper="Choix libre par membre d’équipe."
        />
        <MetricCard
          label="Reps connectés"
          value={
            payload.bookingLink.reps.filter(
              (rep) => rep.connectionStatus === "connected",
            ).length
          }
          helper="Calendriers réellement consolidés."
        />
        <MetricCard
          label="Tâches ouvertes"
          value={tasks.length}
          helper="Relances à repositionner."
        />
        <MetricCard
          label="Pool éligible"
          value={eligiblePoolLabel}
          helper="Selon la taille de société."
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Contexte d’appel</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="client">Client</Label>
                  <Select
                    value={payload.bookingLink.slug}
                    onValueChange={handleWorkspaceChange}
                  >
                    <SelectTrigger id="client">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaceOptions.map((workspace) => (
                        <SelectItem key={workspace.slug} value={workspace.slug}>
                          {workspace.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caller">Caller</Label>
                  <Select value={callerId} onValueChange={setCallerId}>
                    <SelectTrigger id="caller">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {payload.callers.map((caller) => (
                        <SelectItem key={caller.id} value={caller.id}>
                          {caller.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-size">Taille de société</Label>
                  <Select value={companySize} onValueChange={setCompanySize}>
                    <SelectTrigger id="company-size">
                      <SelectValue placeholder="Choisir une tranche" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#001E5B]/40">
                    Client sélectionné
                  </p>
                  <p className="mt-2 font-semibold text-[#001E5B]">
                    {payload.bookingLink.clientName}
                  </p>
                  <p className="text-sm text-[#001E5B]/56">
                    {payload.bookingLink.title}
                  </p>
                </div>

                <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#001E5B]/40">
                    Créneau sélectionné
                  </p>
                  <p className="mt-2 font-semibold text-[#001E5B]">
                    {selectedSlotLabel}
                  </p>
                </div>
              </div>

              {sourceTask ? (
                <div className="rounded-[1.25rem] border border-[#F7A600]/20 bg-[#FFF6E4] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#001E5B]">
                        Repositionnement en cours: {sourceTask.companyName}
                      </p>
                      <p className="text-sm text-[#001E5B]/64">
                        {sourceTask.triggerReason === "cancelled"
                          ? "Annulation"
                          : "No-show"}{" "}
                        · échéance {formatRelativeShort(sourceTask.dueAt)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={resetTask}
                    >
                      Retirer
                    </Button>
                  </div>
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Nom du prospect"
                    id="prospect-name"
                    value={prospectName}
                    onChange={setProspectName}
                  />
                  <Field
                    label="Email du prospect"
                    id="prospect-email"
                    value={prospectEmail}
                    onChange={setProspectEmail}
                    type="email"
                  />
                  <Field
                    label="Entreprise appelée"
                    id="company-name"
                    value={companyName}
                    onChange={setCompanyName}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="notes">Contexte</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Contexte, signaux, objections..."
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={submitting}
                >
                  <CalendarClock className="h-4 w-4" />
                  Réserver le rendez-vous
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Tâches de repositionnement pour ce client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tasks.length ? (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#001E5B]">
                          {task.companyName}
                        </p>
                        <p className="text-sm text-[#001E5B]/56">
                          {task.prospectName} · {task.clientName}
                        </p>
                        <p className="mt-2 text-xs text-[#001E5B]/48">
                          {task.triggerReason === "cancelled"
                            ? "Annulation"
                            : "No-show"}{" "}
                          · RDV initial{" "}
                          {formatRelativeShort(task.sourceStartAt)}
                        </p>
                      </div>
                      <Button
                        className="rounded-full"
                        onClick={() => handleTaskSelect(task)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Repositionner
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-[#001E5B]/12 px-4 py-8 text-sm text-[#001E5B]/44">
                  Aucune relance à traiter pour ce caller sur ce client.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Rendez-vous récents du caller pour ce client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentBookings.length ? (
                recentBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-[#001E5B]">
                              {booking.companyName}
                            </p>
                            <StatusBadge status={booking.displayStatus} />
                          </div>
                          <p className="text-sm text-[#001E5B]/56">
                            {booking.prospectName} · {booking.assignedRepName}
                          </p>
                          <p className="mt-2 text-xs text-[#001E5B]/48">
                            {formatRelativeShort(booking.startAt)}
                          </p>
                        </div>
                        {booking.taskId ? (
                          <div className="rounded-full border border-[#F7A600]/20 bg-[#FFF6E4] px-3 py-1 text-xs font-medium text-[#9C6400]">
                            Relance ouverte
                          </div>
                        ) : booking.cancelMode === "admin_only" ? (
                          <div className="rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs font-medium text-[#001E5B]">
                            Annulation via admin
                          </div>
                        ) : null}
                      </div>
                      {booking.canCancel ? (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-rose-200 text-rose-700"
                            onClick={() => void handleCancelBooking(booking)}
                            disabled={cancellingBookingId === booking.id}
                          >
                            <XCircle
                              className={`h-4 w-4 ${cancellingBookingId === booking.id ? "animate-pulse" : ""}`}
                            />
                            Annuler et rebooker
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-[#001E5B]/12 px-4 py-8 text-sm text-[#001E5B]/44">
                  Aucun rendez-vous récent pour ce caller sur ce client.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Pool connecté pour ce client</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {payload.bookingLink.reps.map((rep) => (
                <div
                  key={rep.id}
                  className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F9F4ED] text-[#001E5B]">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#001E5B]">{rep.name}</p>
                      <p className="text-sm text-[#001E5B]/56">
                        {rep.seniority === "senior" ? "Senior" : "Junior"} ·{" "}
                        {rep.connectionStatus}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <SlotPicker
            availability={availability}
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
            loading={loadingAvailability}
            onPreviousWeek={handlePreviousAvailabilityWeek}
            onNextWeek={handleNextAvailabilityWeek}
            hasPreviousWeek={hasPreviousAvailabilityWeek}
            hasNextWeek={hasNextAvailabilityWeek}
          />
        </div>
      </div>
    </AppChrome>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
