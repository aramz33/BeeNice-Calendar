import { useEffect, useMemo, useState } from "react";
import {
  addWeeks,
  endOfWeek,
  formatISO,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  ArrowRightLeft,
  Cable,
  CalendarRange,
  CheckCheck,
  Clock3,
  ListTodo,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";
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
import { AppChrome } from "@mvp/components/AppChrome";
import { MetricCard } from "@mvp/components/MetricCard";
import { StatusBadge } from "@mvp/components/StatusBadge";
import { apiFetch } from "@mvp/lib/api";
import {
  formatDateShort,
  formatDateTime,
  formatDayShort,
  formatRelativeShort,
  formatTimeOnly,
  getWeekDays,
} from "@mvp/lib/time";
import type {
  AdminBookingsResponse,
  AdminCalendarResponse,
  AdminTasksResponse,
  BookingDetailResponse,
  BookingSummary,
  FollowUpTask,
  SettingsPayload,
  StartRepConnectionResponse,
} from "@mvp/lib/types";

type ViewMode = "agenda" | "list" | "tasks" | "connections";

export function AdminBookingsPage() {
  const [payload, setPayload] = useState<AdminBookingsResponse | null>(null);
  const [calendar, setCalendar] = useState<AdminCalendarResponse | null>(null);
  const [tasksPayload, setTasksPayload] = useState<AdminTasksResponse | null>(null);
  const [settingsPayload, setSettingsPayload] = useState<SettingsPayload | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookingDetailResponse | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [connectingRepId, setConnectingRepId] = useState<string | null>(null);
  const [updatingBooking, setUpdatingBooking] = useState(false);
  const [providerChoiceByRep, setProviderChoiceByRep] = useState<Record<string, string>>({});
  const [statusReason, setStatusReason] = useState("");
  const [manualStartAt, setManualStartAt] = useState("");
  const [activeView, setActiveView] = useState<ViewMode>("agenda");
  const [weekStartIso, setWeekStartIso] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString(),
  );
  const [filters, setFilters] = useState({
    status: "all",
    clientId: "all",
    callerId: "all",
    repId: "all",
    query: "",
  });

  const weekStart = useMemo(() => parseISO(weekStartIso), [weekStartIso]);
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const weekDays = useMemo(() => getWeekDays(weekStartIso), [weekStartIso]);

  const fetchDashboard = async () => {
    setLoadingDashboard(true);
    try {
      const params = new URLSearchParams();
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.clientId !== "all") params.set("clientId", filters.clientId);
      if (filters.callerId !== "all") params.set("callerId", filters.callerId);
      if (filters.repId !== "all") params.set("repId", filters.repId);
      if (filters.query) params.set("query", filters.query);

      const calendarParams = new URLSearchParams(params);
      calendarParams.set("from", weekStart.toISOString());
      calendarParams.set("to", weekEnd.toISOString());

      const [bookings, agenda, tasks, settings] = await Promise.all([
        apiFetch<AdminBookingsResponse>(`/api/admin/bookings?${params.toString()}`),
        apiFetch<AdminCalendarResponse>(`/api/admin/calendar?${calendarParams.toString()}`),
        apiFetch<AdminTasksResponse>(`/api/admin/tasks?${params.toString()}`),
        apiFetch<SettingsPayload>("/api/admin/settings"),
      ]);

      setPayload(bookings);
      setCalendar(agenda);
      setTasksPayload(tasks);
      setSettingsPayload(settings);
      setSelectedBookingId((current) => {
        if (current && bookings.bookings.some((booking) => booking.id === current)) {
          return current;
        }
        return bookings.bookings[0]?.id ?? null;
      });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingDashboard(false);
    }
  };

  const fetchDetail = async (bookingId: string) => {
    setLoadingDetail(true);
    try {
      const data = await apiFetch<BookingDetailResponse>(`/api/admin/bookings/${bookingId}`);
      setDetail(data);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void fetchDashboard();
  }, [
    filters.status,
    filters.clientId,
    filters.callerId,
    filters.repId,
    filters.query,
    weekStartIso,
  ]);

  useEffect(() => {
    if (!selectedBookingId) {
      setDetail(null);
      return;
    }
    void fetchDetail(selectedBookingId);
  }, [selectedBookingId]);

  useEffect(() => {
    if (!payload) return;
    setProviderChoiceByRep((current) => {
      const next = { ...current };
      payload.filters.reps.forEach((rep) => {
        if (!next[rep.id]) {
          next[rep.id] =
            rep.provider === "microsoft" || rep.provider === "google"
              ? rep.provider
              : "google";
        }
      });
      return next;
    });
  }, [payload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const connectionError = params.get("connectionError");

    if (connected) {
      toast.success("Connexion calendrier terminée.");
      params.delete("connected");
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        next ? `/admin/bookings?${next}` : "/admin/bookings",
      );
    }
    if (connectionError) {
      toast.error(connectionError);
      params.delete("connectionError");
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        next ? `/admin/bookings?${next}` : "/admin/bookings",
      );
    }
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/admin/stream");
    const refresh = () => {
      void fetchDashboard();
      if (selectedBookingId) {
        void fetchDetail(selectedBookingId);
      }
    };

    source.addEventListener("booking.updated", refresh);
    source.addEventListener("task.updated", refresh);
    source.addEventListener("connections.updated", refresh);
    source.addEventListener("settings.updated", refresh);
    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [selectedBookingId, weekStartIso, filters]);

  const integrationMode = payload?.integrations.providerMode ?? "mock";
  const liveConnectedCount =
    payload?.filters.reps.filter((rep) => rep.connectionStatus === "connected").length ?? 0;
  const selectedTaskCount = tasksPayload?.tasks.filter((task) => task.status === "open").length ?? 0;

  const handleConnectRep = async (repId: string) => {
    setConnectingRepId(repId);
    try {
      const result = await apiFetch<StartRepConnectionResponse>(
        `/api/admin/reps/${repId}/connect-nylas/start`,
        {
          method: "POST",
          body: JSON.stringify({
            provider: providerChoiceByRep[repId] ?? "google",
          }),
        },
      );

      if (result.authUrl) {
        window.location.assign(result.authUrl);
        return;
      }

      toast.success("Connexion calendrier simulée activée.");
      await fetchDashboard();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConnectingRepId(null);
    }
  };

  const updateOutcome = async (outcomeState: "completed" | "no_show" | "not_qualified") => {
    if (!detail) return;
    setUpdatingBooking(true);
    try {
      await apiFetch(`/api/admin/bookings/${detail.booking.id}/outcome`, {
        method: "PATCH",
        body: JSON.stringify({ outcomeState, reason: statusReason }),
      });
      toast.success("Résultat mis à jour.");
      setStatusReason("");
      await fetchDashboard();
      await fetchDetail(detail.booking.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingBooking(false);
    }
  };

  const cancelBooking = async () => {
    if (!detail) return;
    setUpdatingBooking(true);
    try {
      await apiFetch(`/api/admin/bookings/${detail.booking.id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduleState: "cancelled",
          reason: statusReason,
        }),
      });
      toast.success("Booking annulé.");
      setStatusReason("");
      await fetchDashboard();
      await fetchDetail(detail.booking.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingBooking(false);
    }
  };

  const rescheduleBooking = async () => {
    if (!detail || !manualStartAt) return;
    setUpdatingBooking(true);
    try {
      await apiFetch(`/api/admin/bookings/${detail.booking.id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduleState: "rescheduled",
          nextStartAt: new Date(manualStartAt).toISOString(),
          reason: statusReason,
        }),
      });
      toast.success("Booking déplacé.");
      setStatusReason("");
      setManualStartAt("");
      await fetchDashboard();
      await fetchDetail(detail.booking.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingBooking(false);
    }
  };

  const dismissTask = async (taskId: string) => {
    try {
      await apiFetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed" }),
      });
      await fetchDashboard();
      if (selectedBookingId) {
        await fetchDetail(selectedBookingId);
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <AppChrome
      title="Agenda client BeeNice"
      subtitle="Suivez les rendez-vous pris pour vos clients, les déplacements détectés, les résultats et les tâches de repositionnement."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Planifiés"
          value={payload?.counts.scheduled ?? 0}
          helper="Rendez-vous actuellement au planning."
        />
        <MetricCard
          label="Honorés"
          value={payload?.counts.completed ?? 0}
          helper="Calls menés à terme."
        />
        <MetricCard
          label="À replacer"
          value={(payload?.counts.no_show ?? 0) + (payload?.counts.cancelled ?? 0)}
          helper="No-show + annulations."
        />
        <MetricCard
          label="Tâches ouvertes"
          value={selectedTaskCount}
          helper={`${liveConnectedCount} rep${liveConnectedCount > 1 ? "s" : ""} connecté${liveConnectedCount > 1 ? "s" : ""}.`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Filtres</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="query">Recherche</Label>
                <Input
                  id="query"
                  placeholder="Client, société, prospect..."
                  value={filters.query}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, query: event.target.value }))
                  }
                />
              </div>
              <FilterSelect
                id="client-filter"
                label="Client"
                value={filters.clientId}
                onValueChange={(value) =>
                  setFilters((current) => ({ ...current, clientId: value }))
                }
                options={payload?.filters.clients ?? []}
                allLabel="Tous les clients"
              />
              <FilterSelect
                id="status-filter"
                label="Statut"
                value={filters.status}
                onValueChange={(value) =>
                  setFilters((current) => ({ ...current, status: value }))
                }
                options={(payload?.filters.statuses ?? []).map((status) => ({
                  id: status,
                  name: status,
                }))}
                allLabel="Tous les statuts"
              />
              <FilterSelect
                id="caller-filter"
                label="Caller"
                value={filters.callerId}
                onValueChange={(value) =>
                  setFilters((current) => ({ ...current, callerId: value }))
                }
                options={payload?.filters.callers ?? []}
                allLabel="Tous les callers"
              />
              <FilterSelect
                id="rep-filter"
                label="Rep"
                value={filters.repId}
                onValueChange={(value) =>
                  setFilters((current) => ({ ...current, repId: value }))
                }
                options={(payload?.filters.reps ?? []).map((rep) => ({
                  id: rep.id,
                  name: rep.name,
                }))}
                allLabel="Tous les reps"
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <ViewButton active={activeView === "agenda"} onClick={() => setActiveView("agenda")} icon={CalendarRange} label="Agenda" />
              <ViewButton active={activeView === "list"} onClick={() => setActiveView("list")} icon={ArrowRightLeft} label="Liste" />
              <ViewButton active={activeView === "tasks"} onClick={() => setActiveView("tasks")} icon={ListTodo} label="Tâches" />
              <ViewButton active={activeView === "connections"} onClick={() => setActiveView("connections")} icon={Cable} label="Connexions" />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => setWeekStartIso(subWeeks(weekStart, 1).toISOString())}>
                Semaine précédente
              </Button>
              <div className="rounded-full border border-[#001E5B]/10 bg-white px-4 py-2 text-sm font-medium text-[#001E5B]">
                {formatDateShort(weekStartIso)} → {formatDateShort(weekEnd.toISOString())}
              </div>
              <Button variant="outline" className="rounded-full" onClick={() => setWeekStartIso(addWeeks(weekStart, 1).toISOString())}>
                Semaine suivante
              </Button>
            </div>
          </div>

          {activeView === "agenda" && (
            <AgendaBoard
              loading={loadingDashboard}
              entries={calendar?.entries ?? []}
              weekDays={weekDays}
              onSelect={setSelectedBookingId}
              selectedBookingId={selectedBookingId}
              timezone={payload?.timezone ?? "Europe/Paris"}
            />
          )}

          {activeView === "list" && (
            <Card className="surface-card">
              <CardHeader>
                <CardTitle>Liste des rendez-vous</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingDashboard ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-24 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5" />
                  ))
                ) : (
                  payload?.bookings.map((booking) => (
                    <BookingListItem
                      key={booking.id}
                      booking={booking}
                      selected={booking.id === selectedBookingId}
                      onSelect={setSelectedBookingId}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {activeView === "tasks" && (
            <Card className="surface-card">
              <CardHeader>
                <CardTitle>Tâches de repositionnement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tasksPayload?.tasks.length ? (
                  tasksPayload.tasks.map((task) => (
                    <TaskCard key={task.id} task={task} onDismiss={dismissTask} />
                  ))
                ) : (
                  <EmptyState message="Aucune tâche ne correspond à ces filtres." />
                )}
              </CardContent>
            </Card>
          )}

          {activeView === "connections" && (
            <Card className="surface-card">
              <CardHeader>
                <CardTitle>Connexions calendrier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
                  <p className="font-semibold text-[#001E5B]">
                    Mode {integrationMode === "nylas" ? "Nylas" : "mock"}
                  </p>
                  <p className="mt-2 text-sm text-[#001E5B]/64">
                    {integrationMode === "nylas"
                      ? "Les changements du calendrier client sont remontés dans l’agenda admin via Nylas."
                      : "Mode démo: connexions simulées pour tester l’agenda live sans provider externe."}
                  </p>
                </div>

                {payload?.filters.reps.map((rep) => (
                  <div
                    key={rep.id}
                    className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-[#001E5B]">{rep.name}</p>
                        <p className="text-sm text-[#001E5B]/56">
                          {rep.seniority === "senior" ? "Senior" : "Junior"}
                          {rep.providerEmail ? ` · ${rep.providerEmail}` : ""}
                        </p>
                        <div className="mt-2 space-y-1 text-xs text-[#001E5B]/56">
                          <p>Dernière synchro: {rep.lastSyncAt ? formatRelativeShort(rep.lastSyncAt) : "jamais"}</p>
                          <p>Dernier webhook: {rep.lastWebhookAt ? formatRelativeShort(rep.lastWebhookAt) : "jamais"}</p>
                          {rep.lastError ? <p className="text-rose-600">{rep.lastError}</p> : null}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs font-medium text-[#001E5B]">
                          {rep.connectionStatus}
                        </div>
                        <div className="flex gap-2">
                          <Select
                            value={providerChoiceByRep[rep.id] ?? "google"}
                            onValueChange={(value) =>
                              setProviderChoiceByRep((current) => ({ ...current, [rep.id]: value }))
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="google">Google</SelectItem>
                              <SelectItem value="microsoft">Microsoft</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            className="rounded-full"
                            onClick={() => void handleConnectRep(rep.id)}
                            disabled={connectingRepId === rep.id}
                          >
                            <RefreshCw className={`h-4 w-4 ${connectingRepId === rep.id ? "animate-spin" : ""}`} />
                            Connecter
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="surface-card self-start">
          <CardHeader>
            <CardTitle>Détail du rendez-vous</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadingDetail ? (
              <div className="h-96 animate-pulse rounded-[1.5rem] bg-[#001E5B]/5" />
            ) : detail ? (
              <>
                <div className="space-y-3 rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#001E5B]">{detail.booking.companyName}</p>
                      <p className="text-sm text-[#001E5B]/56">
                        {detail.booking.prospectName} · {detail.booking.clientName}
                      </p>
                    </div>
                    <StatusBadge status={detail.booking.displayStatus} />
                  </div>
                  <div className="grid gap-2 text-sm text-[#001E5B]/72">
                    <p>Caller: {detail.booking.callerName}</p>
                    <p>Rep: {detail.booking.assignedRepName}</p>
                    <p>Date courante: {formatDateTime(detail.booking.startAt, detail.booking.timezone)}</p>
                    <p>Date originale: {formatDateTime(detail.booking.originalStartAt, detail.booking.timezone)}</p>
                    {detail.booking.previousStartAt ? (
                      <p>Dernière date avant déplacement: {formatDateTime(detail.booking.previousStartAt, detail.booking.timezone)}</p>
                    ) : null}
                    <p>Sync calendrier: {detail.booking.calendarSyncState}</p>
                    {detail.booking.linkedTask ? (
                      <p>Tâche liée: {detail.booking.linkedTask.status} · échéance {formatRelativeShort(detail.booking.linkedTask.dueAt)}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status-reason">Note admin</Label>
                  <Input
                    id="status-reason"
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                    placeholder="Ex: prospect absent, à rappeler demain."
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button className="rounded-full" disabled={updatingBooking} onClick={() => void updateOutcome("completed")}>
                    <CheckCheck className="h-4 w-4" />
                    Honoré
                  </Button>
                  <Button variant="outline" className="rounded-full" disabled={updatingBooking} onClick={() => void updateOutcome("no_show")}>
                    <Clock3 className="h-4 w-4" />
                    No-show
                  </Button>
                  <Button variant="outline" className="rounded-full" disabled={updatingBooking} onClick={() => void updateOutcome("not_qualified")}>
                    <Settings2 className="h-4 w-4" />
                    Non qualifié
                  </Button>
                  <Button variant="outline" className="rounded-full border-rose-200 text-rose-700" disabled={updatingBooking} onClick={() => void cancelBooking()}>
                    <XCircle className="h-4 w-4" />
                    Annuler
                  </Button>
                </div>

                <div className="space-y-2 rounded-[1.25rem] border border-dashed border-[#001E5B]/12 bg-[#F9F4ED] px-4 py-4">
                  <Label htmlFor="manual-start">Déplacer manuellement</Label>
                  <Input
                    id="manual-start"
                    type="datetime-local"
                    value={manualStartAt}
                    onChange={(event) => setManualStartAt(event.target.value)}
                  />
                  <Button variant="outline" className="rounded-full" disabled={!manualStartAt || updatingBooking} onClick={() => void rescheduleBooking()}>
                    Déplacer le rendez-vous
                  </Button>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#001E5B]/44">
                    Timeline
                  </p>
                  {detail.timeline.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                    >
                      <p className="font-medium text-[#001E5B]">{event.actorLabel}</p>
                      <p className="mt-1 text-sm text-[#001E5B]/64">{event.reason || event.type}</p>
                      <p className="mt-2 text-xs text-[#001E5B]/48">{formatRelativeShort(event.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState message="Sélectionnez un rendez-vous pour afficher son détail." />
            )}
          </CardContent>
        </Card>
      </div>
    </AppChrome>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  allLabel,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  allLabel: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarRange;
  label: string;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      className="rounded-full"
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function AgendaBoard({
  loading,
  entries,
  weekDays,
  selectedBookingId,
  onSelect,
  timezone,
}: {
  loading: boolean;
  entries: BookingSummary[];
  weekDays: Date[];
  selectedBookingId: string | null;
  onSelect: (id: string) => void;
  timezone: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, BookingSummary[]>();
    weekDays.forEach((day) => {
      map.set(formatISO(day, { representation: "date" }), []);
    });
    entries.forEach((entry) => {
      const key = formatISO(parseISO(entry.startAt), { representation: "date" });
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(entry);
    });
    map.forEach((items) =>
      items.sort((left, right) => left.startAt.localeCompare(right.startAt)),
    );
    return map;
  }, [entries, weekDays]);

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>Agenda semaine</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="h-72 animate-pulse rounded-[1.5rem] bg-[#001E5B]/5" />
            ))}
          </div>
        ) : (
          <div className="agenda-grid">
            {weekDays.map((day) => {
              const key = formatISO(day, { representation: "date" });
              const items = grouped.get(key) ?? [];
              return (
                <div key={key} className="agenda-column">
                  <div className="agenda-day-head">
                    <p className="text-sm font-semibold capitalize text-[#001E5B]">
                      {formatDayShort(day.toISOString(), timezone)}
                    </p>
                    <p className="text-xs text-[#001E5B]/48">{items.length} rendez-vous</p>
                  </div>
                  <div className="space-y-2">
                    {items.length ? (
                      items.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={`agenda-card ${selectedBookingId === entry.id ? "agenda-card-selected" : ""}`}
                          onClick={() => onSelect(entry.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[#001E5B]">
                              {formatTimeOnly(entry.startAt, timezone)}
                            </p>
                            <StatusBadge status={entry.displayStatus} />
                          </div>
                          <p className="mt-2 font-medium text-[#001E5B]">{entry.companyName}</p>
                          <p className="text-sm text-[#001E5B]/64">{entry.prospectName}</p>
                          {entry.previousStartAt ? (
                            <p className="mt-2 text-xs text-[#001E5B]/48">
                              Déplacé depuis {formatTimeOnly(entry.previousStartAt, timezone)}
                            </p>
                          ) : null}
                        </button>
                      ))
                    ) : (
                      <div className="rounded-[1.25rem] border border-dashed border-[#001E5B]/10 px-3 py-6 text-center text-sm text-[#001E5B]/40">
                        Aucun rendez-vous
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BookingListItem({
  booking,
  selected,
  onSelect,
}: {
  booking: BookingSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(booking.id)}
      className={`w-full rounded-[1.25rem] border px-4 py-4 text-left transition ${
        selected
          ? "border-[#F7A600] bg-[#FFF7E8]"
          : "border-[#001E5B]/8 bg-white hover:border-[#001E5B]/16"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[#001E5B]">{booking.companyName}</p>
            <StatusBadge status={booking.displayStatus} />
          </div>
          <p className="text-sm text-[#001E5B]/64">
            {booking.prospectName} · {booking.clientName}
          </p>
          <p className="text-xs text-[#001E5B]/48">
            {formatRelativeShort(booking.startAt)} · {booking.callerName} → {booking.assignedRepName}
          </p>
        </div>
      </div>
    </button>
  );
}

function TaskCard({
  task,
  onDismiss,
}: {
  task: FollowUpTask;
  onDismiss: (taskId: string) => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#001E5B]">{task.companyName}</p>
          <p className="text-sm text-[#001E5B]/56">
            {task.prospectName} · {task.clientName} · {task.callerName}
          </p>
        </div>
        <div className="rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs font-medium text-[#001E5B]">
          {task.status}
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm text-[#001E5B]/64">
        <p>Motif: {task.triggerReason === "cancelled" ? "Annulation" : "No-show"}</p>
        <p>RDV source: {formatRelativeShort(task.sourceStartAt)}</p>
        <p>Échéance: {formatRelativeShort(task.dueAt)}</p>
      </div>
      {task.status === "open" ? (
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onDismiss(task.id)}>
            Classer la tâche
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[#001E5B]/12 px-4 py-10 text-center text-sm text-[#001E5B]/44">
      {message}
    </div>
  );
}
