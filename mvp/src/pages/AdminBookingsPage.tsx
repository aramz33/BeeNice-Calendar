import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addWeeks,
  endOfDay,
  endOfWeek,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  ArrowRightLeft,
  Cable,
  CalendarRange,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ListTodo,
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
import { SlotPicker } from "@mvp/components/SlotPicker";
import { StatusBadge } from "@mvp/components/StatusBadge";
import { apiFetch } from "@mvp/lib/api";
import {
  formatDateKeyInTimezone,
  formatDateTime,
  formatDayShort,
  formatMonthYear,
  formatRelativeShort,
  formatTimeOnly,
  getBusinessWeekDays,
} from "@mvp/lib/time";
import type {
  AdminBookingsResponse,
  AdminCalendarResponse,
  AdminTasksResponse,
  AvailabilityResponse,
  BookingDetailResponse,
  BookingSummary,
  FollowUpTask,
  SettingsPayload,
} from "@mvp/lib/types";

type ViewMode = "agenda" | "list" | "tasks" | "connections";

export function AdminBookingsPage() {
  const [payload, setPayload] = useState<AdminBookingsResponse | null>(null);
  const [calendar, setCalendar] = useState<AdminCalendarResponse | null>(null);
  const [tasksPayload, setTasksPayload] = useState<AdminTasksResponse | null>(
    null,
  );
  const [settingsPayload, setSettingsPayload] =
    useState<SettingsPayload | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] = useState<BookingDetailResponse | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updatingBooking, setUpdatingBooking] = useState(false);
  const [statusReason, setStatusReason] = useState("");
  const [rescheduleAvailability, setRescheduleAvailability] =
    useState<AvailabilityResponse | null>(null);
  const [rescheduleWeekStartIso, setRescheduleWeekStartIso] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString(),
  );
  const [loadingRescheduleAvailability, setLoadingRescheduleAvailability] =
    useState(false);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<string | null>(
    null,
  );
  const [activeView, setActiveView] = useState<ViewMode>("agenda");
  const [weekStartIso, setWeekStartIso] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString(),
  );
  const [todayDateKey, setTodayDateKey] = useState(() =>
    formatDateKeyInTimezone(new Date(), "Europe/Paris"),
  );
  const [filters, setFilters] = useState({
    status: "all",
    clientId: "all",
    callerId: "all",
    repId: "all",
    query: "",
  });

  const weekStart = useMemo(() => parseISO(weekStartIso), [weekStartIso]);
  const visibleWeekEnd = useMemo(
    () => endOfDay(addDays(weekStart, 4)),
    [weekStart],
  );
  const weekDays = useMemo(
    () => getBusinessWeekDays(weekStartIso),
    [weekStartIso],
  );
  const agendaTimezone = payload?.timezone ?? "Europe/Paris";
  const weekLabel = useMemo(() => {
    // When a visible work week spans two months, use Monday's month as the label.
    const referenceDay = weekDays[0] ?? weekStart;
    return formatMonthYear(referenceDay.toISOString(), agendaTimezone);
  }, [agendaTimezone, weekDays, weekStart]);
  const rescheduleWeekStart = useMemo(
    () => parseISO(rescheduleWeekStartIso),
    [rescheduleWeekStartIso],
  );
  const firstRescheduleWeekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    [],
  );
  const lastRescheduleWeekStart = useMemo(
    () => addWeeks(firstRescheduleWeekStart, 11),
    [firstRescheduleWeekStart],
  );
  const hasPreviousRescheduleWeek =
    rescheduleWeekStart > firstRescheduleWeekStart;
  const hasNextRescheduleWeek = rescheduleWeekStart < lastRescheduleWeekStart;
  const rescheduleSelectedSlot = useMemo(
    () =>
      rescheduleAvailability?.slots.find(
        (slot) => slot.startAt === selectedRescheduleSlot,
      ) ?? null,
    [rescheduleAvailability, selectedRescheduleSlot],
  );

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
      calendarParams.set("to", visibleWeekEnd.toISOString());

      const [bookings, agenda, tasks, settings] = await Promise.all([
        apiFetch<AdminBookingsResponse>(
          `/api/admin/bookings?${params.toString()}`,
        ),
        apiFetch<AdminCalendarResponse>(
          `/api/admin/calendar?${calendarParams.toString()}`,
        ),
        apiFetch<AdminTasksResponse>(`/api/admin/tasks?${params.toString()}`),
        apiFetch<SettingsPayload>("/api/admin/settings"),
      ]);

      setPayload(bookings);
      setCalendar(agenda);
      setTasksPayload(tasks);
      setSettingsPayload(settings);
      setSelectedBookingId((current) => {
        if (current) {
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
      const data = await apiFetch<BookingDetailResponse>(
        `/api/admin/bookings/${bookingId}`,
      );
      setDetail(data);
    } catch (error) {
      setDetail(null);
      setRescheduleAvailability(null);
      setSelectedRescheduleSlot(null);
      toast.error((error as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const fetchRescheduleAvailability = async (
    bookingId: string,
    nextWeekStart: Date = rescheduleWeekStart,
    preferredSlot: string | null = selectedRescheduleSlot,
  ) => {
    setLoadingRescheduleAvailability(true);
    try {
      const weekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 1 });
      const params = new URLSearchParams({
        from: nextWeekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      const data = await apiFetch<AvailabilityResponse>(
        `/api/admin/bookings/${bookingId}/availability?${params.toString()}`,
      );
      setRescheduleAvailability(data);
      setSelectedRescheduleSlot(
        preferredSlot && data.slots.some((slot) => slot.startAt === preferredSlot)
          ? preferredSlot
          : null,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingRescheduleAvailability(false);
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
      setRescheduleAvailability(null);
      setSelectedRescheduleSlot(null);
      return;
    }
    void fetchDetail(selectedBookingId);
  }, [selectedBookingId]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    const bookingWeekStart = startOfWeek(parseISO(detail.booking.startAt), {
      weekStartsOn: 1,
    });
    const nextWeekStart =
      bookingWeekStart < firstRescheduleWeekStart
        ? firstRescheduleWeekStart
        : bookingWeekStart;
    setRescheduleWeekStartIso(nextWeekStart.toISOString());
    setSelectedRescheduleSlot(null);
    void fetchRescheduleAvailability(detail.booking.id, nextWeekStart, null);
  }, [detail?.booking.id, detail?.booking.startAt, firstRescheduleWeekStart]);

  useEffect(() => {
    const syncToday = () => {
      setTodayDateKey(formatDateKeyInTimezone(new Date(), agendaTimezone));
    };

    syncToday();

    let intervalId: number | undefined;
    const remainder = Date.now() % 60_000;
    const msUntilNextMinute = remainder === 0 ? 60_000 : 60_000 - remainder;
    const timeoutId = window.setTimeout(() => {
      syncToday();
      intervalId = window.setInterval(syncToday, 60_000);
    }, msUntilNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [agendaTimezone]);

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
    payload?.filters.reps.filter((rep) => rep.connectionStatus === "connected")
      .length ?? 0;
  const selectedTaskCount =
    tasksPayload?.tasks.filter((task) => task.status === "open").length ?? 0;

  const updateOutcome = async (
    outcomeState: "completed" | "no_show" | "not_qualified",
  ) => {
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
    if (!detail || !selectedRescheduleSlot) return;
    setUpdatingBooking(true);
    try {
      await apiFetch(`/api/admin/bookings/${detail.booking.id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduleState: "rescheduled",
          nextStartAt: selectedRescheduleSlot,
          reason: statusReason,
        }),
      });
      toast.success("Booking déplacé.");
      setStatusReason("");
      setSelectedRescheduleSlot(null);
      await fetchDashboard();
      await fetchDetail(detail.booking.id);
      await fetchRescheduleAvailability(detail.booking.id, rescheduleWeekStart, null);
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

  const buildInviteLink = (inviteToken?: string | null) => {
    if (!inviteToken) {
      return "";
    }

    const relativePath = `/connect/${inviteToken}`;
    if (typeof window === "undefined") {
      return relativePath;
    }

    return `${window.location.origin}${relativePath}`;
  };

  const copyInviteLink = async (inviteToken?: string | null) => {
    const inviteLink = buildInviteLink(inviteToken);
    if (!inviteLink) {
      toast.error("Lien de connexion indisponible.");
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Lien de connexion copie.");
    } catch {
      toast.error("Copie du lien impossible.");
    }
  };

  const formatRepSeniority = (seniority: string) => {
    if (seniority === "senior") {
      return "Senior";
    }
    if (seniority === "junior") {
      return "Junior";
    }
    return "Non défini";
  };

  const connectionGroups = useMemo(() => {
    const reps = payload?.filters.reps ?? [];
    const clients = (settingsPayload?.clients ?? []).filter((client) => client.active);

    return clients.map((client) => ({
      client,
      reps: reps.filter((rep) => rep.clientId === client.id),
    }));
  }, [payload?.filters.reps, settingsPayload?.clients]);

  return (
    <AppChrome title="Admin">
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
          value={
            (payload?.counts.no_show ?? 0) + (payload?.counts.cancelled ?? 0)
          }
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
                    setFilters((current) => ({
                      ...current,
                      query: event.target.value,
                    }))
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
                  name: `${rep.name} · ${rep.clientName}`,
                }))}
                allLabel="Tous les reps"
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <ViewButton
                active={activeView === "agenda"}
                onClick={() => setActiveView("agenda")}
                icon={CalendarRange}
                label="Agenda"
              />
              <ViewButton
                active={activeView === "list"}
                onClick={() => setActiveView("list")}
                icon={ArrowRightLeft}
                label="RDV"
              />
              <ViewButton
                active={activeView === "tasks"}
                onClick={() => setActiveView("tasks")}
                icon={ListTodo}
                label="Tâches"
              />
              <ViewButton
                active={activeView === "connections"}
                onClick={() => setActiveView("connections")}
                icon={Cable}
                label="Connexions"
              />
            </div>

            {activeView === "agenda" && (
              <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-semibold capitalize text-[#001E5B]">
                  {weekLabel}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() =>
                      setWeekStartIso(subWeeks(weekStart, 1).toISOString())
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      setWeekStartIso(
                        startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString(),
                      )
                    }
                  >
                    Aujourd'hui
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() =>
                      setWeekStartIso(addWeeks(weekStart, 1).toISOString())
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {activeView === "agenda" && (
            <AgendaBoard
              loading={loadingDashboard}
              entries={calendar?.entries ?? []}
              weekDays={weekDays}
              onSelect={setSelectedBookingId}
              selectedBookingId={selectedBookingId}
              timezone={agendaTimezone}
              todayDateKey={todayDateKey}
            />
          )}

          {activeView === "list" && (
            <Card className="surface-card">
              <CardHeader>
                <CardTitle>Liste des rendez-vous</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingDashboard
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-24 animate-pulse rounded-[1.25rem] bg-[#001E5B]/5"
                      />
                    ))
                  : payload?.bookings.map((booking) => (
                      <BookingListItem
                        key={booking.id}
                        booking={booking}
                        selected={booking.id === selectedBookingId}
                        onSelect={setSelectedBookingId}
                      />
                    ))}
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
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDismiss={dismissTask}
                    />
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

                {connectionGroups.map((group) => (
                  <div
                    key={group.client.id}
                    className="rounded-[1.5rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-[#001E5B]">
                          {group.client.name}
                        </p>
                        <p className="mt-2 text-sm text-[#001E5B]/64">
                          Lien generique a envoyer aux reps du client pour qu'ils
                          connectent eux-memes leur agenda.
                        </p>
                        <p className="mt-1 text-xs text-[#001E5B]/48">
                          {group.client.routingMode === "weighted_seniority"
                            ? "Routing senior/junior"
                            : "Pool unique"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            void copyInviteLink(group.client.connectionInviteToken)
                          }
                        >
                          <Copy className="h-4 w-4" />
                          Copier le lien
                        </Button>
                        <a
                          href={buildInviteLink(group.client.connectionInviteToken)}
                          className="inline-flex items-center rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-2 text-sm font-medium text-[#001E5B]"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ouvrir le lien
                        </a>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[1.25rem] border border-dashed border-[#001E5B]/12 bg-[#F9F4ED] px-4 py-3 text-xs text-[#001E5B]/64">
                      {buildInviteLink(group.client.connectionInviteToken)}
                    </div>

                    <div className="mt-4 space-y-3">
                      {group.reps.length ? (
                        group.reps.map((rep) => (
                          <div
                            key={rep.id}
                            className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <p className="font-semibold text-[#001E5B]">
                                  {rep.name}
                                </p>
                                <p className="text-sm text-[#001E5B]/56">
                                  {formatRepSeniority(rep.seniority)}
                                  {rep.providerEmail ? ` · ${rep.providerEmail}` : ""}
                                </p>
                                <div className="mt-2 space-y-1 text-xs text-[#001E5B]/56">
                                  <p>
                                    Dernière synchro:{" "}
                                    {rep.lastSyncAt
                                      ? formatRelativeShort(rep.lastSyncAt)
                                      : "jamais"}
                                  </p>
                                  <p>
                                    Dernier webhook:{" "}
                                    {rep.lastWebhookAt
                                      ? formatRelativeShort(rep.lastWebhookAt)
                                      : "jamais"}
                                  </p>
                                  {rep.lastError ? (
                                    <p className="text-rose-600">{rep.lastError}</p>
                                  ) : null}
                                </div>
                              </div>
                              <div className="rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs font-medium text-[#001E5B]">
                                {rep.connectionStatus}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[1.25rem] border border-dashed border-[#001E5B]/12 px-4 py-8 text-sm text-[#001E5B]/44">
                          Aucun rep n'est encore connecté pour ce client.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="surface-card overflow-y-auto">
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
                      <p className="font-semibold text-[#001E5B]">
                        {detail.booking.companyName}
                      </p>
                      <p className="text-sm text-[#001E5B]/56">
                        {detail.booking.prospectName} ·{" "}
                        {detail.booking.clientName}
                      </p>
                    </div>
                    <StatusBadge status={detail.booking.displayStatus} />
                  </div>
                  <div className="grid gap-2 text-sm text-[#001E5B]/72">
                    <p>Client BeNice: {detail.booking.clientName}</p>
                    <p>Caller BeNice: {detail.booking.callerName}</p>
                    <p>Rep côté client: {detail.booking.assignedRepName}</p>
                    <p>Taille société: {detail.booking.companySize} salariés</p>
                    <p>
                      Date courante:{" "}
                      {formatDateTime(
                        detail.booking.startAt,
                        detail.booking.timezone,
                      )}
                    </p>
                    <p>
                      Date originale:{" "}
                      {formatDateTime(
                        detail.booking.originalStartAt,
                        detail.booking.timezone,
                      )}
                    </p>
                    {detail.booking.previousStartAt ? (
                      <p>
                        Dernière date avant déplacement:{" "}
                        {formatDateTime(
                          detail.booking.previousStartAt,
                          detail.booking.timezone,
                        )}
                      </p>
                    ) : null}
                    <p>Sync calendrier: {detail.booking.calendarSyncState}</p>
                    {detail.booking.linkedTask ? (
                      <p>
                        Tâche liée: {detail.booking.linkedTask.status} ·
                        échéance{" "}
                        {formatRelativeShort(detail.booking.linkedTask.dueAt)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#001E5B]/40">
                    Raison d’assignation
                  </p>
                  <div className="mt-3 grid gap-2 text-sm text-[#001E5B]/72">
                    <p>
                      Mode de routing:{" "}
                      {detail.booking.assignmentReason.routingMode ===
                      "weighted_seniority"
                        ? "Routing senior/junior"
                        : "Pool unique"}
                    </p>
                    <p>
                      Pool retenu:{" "}
                      {detail.booking.assignmentReason.seniorityPool === "senior"
                        ? "Senior uniquement"
                        : "Pool complet"}
                    </p>
                    <p>
                      Rôle choisi:{" "}
                      {detail.booking.assignmentReason.chosenRole === "senior"
                        ? "Senior"
                        : detail.booking.assignmentReason.chosenRole === "junior"
                          ? "Junior"
                          : detail.booking.assignmentReason.chosenRole ===
                              "non_defini"
                            ? "Non défini"
                            : "Pool unique"}
                    </p>
                    <p>
                      Seuil de qualification:{" "}
                      {detail.booking.assignmentReason.companySizeThreshold}
                    </p>
                    <p>
                      Candidats éligibles:{" "}
                      {(
                        detail.booking.assignmentReason.candidateRepNames ??
                        detail.booking.assignmentReason.candidateRepIds
                      ).join(", ")}
                    </p>
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
                  <Button
                    className="rounded-full"
                    disabled={updatingBooking}
                    onClick={() => void updateOutcome("completed")}
                  >
                    <CheckCheck className="h-4 w-4" />
                    Honoré
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={updatingBooking}
                    onClick={() => void updateOutcome("no_show")}
                  >
                    <Clock3 className="h-4 w-4" />
                    No-show
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={updatingBooking}
                    onClick={() => void updateOutcome("not_qualified")}
                  >
                    <Settings2 className="h-4 w-4" />
                    Non qualifié
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-rose-200 text-rose-700"
                    disabled={updatingBooking}
                    onClick={() => void cancelBooking()}
                  >
                    <XCircle className="h-4 w-4" />
                    Annuler
                  </Button>
                </div>

                <div className="space-y-4 rounded-[1.25rem] border border-dashed border-[#001E5B]/12 bg-[#F9F4ED] px-4 py-4">
                  <div className="space-y-2">
                    <Label>Déplacer selon les disponibilités</Label>
                    <p className="text-sm text-[#001E5B]/64">
                      Le nouveau créneau est choisi sur les disponibilités live du
                      client. Le routage réassigne automatiquement le rendez-vous
                      au rep éligible disponible sur ce créneau.
                    </p>
                  </div>

                  <SlotPicker
                    availability={rescheduleAvailability}
                    selectedSlot={selectedRescheduleSlot}
                    onSelect={setSelectedRescheduleSlot}
                    loading={loadingRescheduleAvailability}
                    onPreviousWeek={() => {
                      if (!detail || !hasPreviousRescheduleWeek) {
                        return;
                      }
                      const nextWeek = subWeeks(rescheduleWeekStart, 1);
                      setRescheduleWeekStartIso(nextWeek.toISOString());
                      void fetchRescheduleAvailability(
                        detail.booking.id,
                        nextWeek,
                        selectedRescheduleSlot,
                      );
                    }}
                    onNextWeek={() => {
                      if (!detail || !hasNextRescheduleWeek) {
                        return;
                      }
                      const nextWeek = addWeeks(rescheduleWeekStart, 1);
                      setRescheduleWeekStartIso(nextWeek.toISOString());
                      void fetchRescheduleAvailability(
                        detail.booking.id,
                        nextWeek,
                        selectedRescheduleSlot,
                      );
                    }}
                    hasPreviousWeek={hasPreviousRescheduleWeek}
                    hasNextWeek={hasNextRescheduleWeek}
                  />

                  {rescheduleSelectedSlot ? (
                    <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4 text-sm text-[#001E5B]/72">
                      <p className="font-medium text-[#001E5B]">
                        Créneau sélectionné:{" "}
                        {formatDateTime(
                          rescheduleSelectedSlot.startAt,
                          detail.booking.timezone,
                        )}
                      </p>
                      <p className="mt-2">
                        Reps disponibles:{" "}
                        {(rescheduleSelectedSlot.availableRepNames ?? []).join(", ")}
                      </p>
                    </div>
                  ) : null}

                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={!selectedRescheduleSlot || updatingBooking}
                    onClick={() => void rescheduleBooking()}
                  >
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
                      <p className="font-medium text-[#001E5B]">
                        {event.actorLabel}
                      </p>
                      <p className="mt-1 text-sm text-[#001E5B]/64">
                        {event.reason || event.type}
                      </p>
                      <p className="mt-2 text-xs text-[#001E5B]/48">
                        {formatRelativeShort(event.createdAt)}
                      </p>
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

const CALENDAR_START_HOUR = 9;
const CALENDAR_END_HOUR = 18;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT_PX = 44;
const TOTAL_SLOTS =
  (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * (60 / SLOT_MINUTES);
const TOTAL_HEIGHT_PX = TOTAL_SLOTS * SLOT_HEIGHT_PX;
const CALENDAR_START_MINUTES = CALENDAR_START_HOUR * 60;
const CALENDAR_END_MINUTES = CALENDAR_END_HOUR * 60;
const CALENDAR_HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, i) => CALENDAR_START_HOUR + i,
);

type EventTiming = {
  entry: BookingSummary;
  startMin: number;
  endMin: number;
  visibleStartMin: number;
  visibleEndMin: number;
};

function parseIsoSafe(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getTimeInMinutes(
  iso: string | null | undefined,
  timezone: string,
): number | null {
  if (typeof iso !== "string" || !iso) {
    return null;
  }

  const timeStr = formatTimeOnly(iso, timezone);
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m ?? 0)) {
    return null;
  }

  return h * 60 + (m ?? 0);
}

function getEventTiming(
  entry: BookingSummary,
  timezone: string,
): EventTiming | null {
  const startMin = getTimeInMinutes(entry.startAt, timezone);
  if (startMin === null) {
    return null;
  }

  const startAt = parseIsoSafe(entry.startAt);
  const endAt = parseIsoSafe(entry.endAt);
  const durationMinutes =
    startAt && endAt
      ? Math.max(
          SLOT_MINUTES,
          Math.round((endAt.getTime() - startAt.getTime()) / (60 * 1000)),
        )
      : SLOT_MINUTES;
  const endMin = startMin + durationMinutes;

  return {
    entry,
    startMin,
    endMin,
    visibleStartMin: Math.max(startMin, CALENDAR_START_MINUTES),
    visibleEndMin: Math.min(endMin, CALENDAR_END_MINUTES),
  };
}

function calcEventTop(startMin: number): number {
  return ((startMin - CALENDAR_START_MINUTES) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

function calcEventHeight(startMin: number, endMin: number): number {
  return ((endMin - startMin) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
}

function isEventInRange(entry: BookingSummary, timezone: string): boolean {
  const timing = getEventTiming(entry, timezone);
  return timing ? timing.visibleStartMin < timing.visibleEndMin : false;
}

function assignTracks(
  events: BookingSummary[],
  timezone: string,
): Array<{
  entry: BookingSummary;
  track: number;
  trackCount: number;
  top: number;
  height: number;
}> {
  const sorted = events
    .map((entry) => getEventTiming(entry, timezone))
    .filter((timing): timing is EventTiming => timing !== null)
    .sort((a, b) => {
      if (a.startMin !== b.startMin) {
        return a.startMin - b.startMin;
      }
      return a.endMin - b.endMin;
    });
  const trackEnds: number[] = [];
  const result: Array<{
    entry: BookingSummary;
    track: number;
    trackCount: number;
    startMin: number;
    endMin: number;
    top: number;
    height: number;
  }> = [];

  sorted.forEach((timing) => {
    const { entry, startMin, endMin, visibleStartMin, visibleEndMin } = timing;
    let track = trackEnds.findIndex((end) => end <= startMin);
    if (track === -1) track = trackEnds.length;
    trackEnds[track] = endMin;
    result.push({
      entry,
      track,
      trackCount: 0,
      startMin,
      endMin,
      top: calcEventTop(visibleStartMin),
      height: calcEventHeight(visibleStartMin, visibleEndMin),
    });
  });

  result.forEach((item) => {
    item.trackCount = result.filter((other) => {
      return other.startMin < item.endMin && other.endMin > item.startMin;
    }).length;
  });

  return result.map(({ startMin: _startMin, endMin: _endMin, ...item }) => item);
}

function AgendaBoard({
  loading,
  entries,
  weekDays,
  selectedBookingId,
  onSelect,
  timezone,
  todayDateKey,
}: {
  loading: boolean;
  entries: BookingSummary[];
  weekDays: Date[];
  selectedBookingId: string | null;
  onSelect: (id: string) => void;
  timezone: string;
  todayDateKey: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, BookingSummary[]>();
    weekDays.forEach((day) => {
      map.set(formatDateKeyInTimezone(day, timezone), []);
    });
    entries.forEach((entry) => {
      const startAt = parseIsoSafe(entry.startAt);
      if (!startAt) {
        return;
      }

      const key = formatDateKeyInTimezone(startAt, timezone);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(entry);
    });
    map.forEach((items) =>
      items.sort((left, right) => left.startAt.localeCompare(right.startAt)),
    );
    return map;
  }, [entries, timezone, weekDays]);

  return (
    <Card className="surface-card overflow-x-auto">
      <CardHeader>
        <CardTitle>Agenda semaine</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: weekDays.length }).map((_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-[1.5rem] bg-[#001E5B]/5"
              />
            ))}
          </div>
        ) : (
          <div style={{ minWidth: "680px" }}>
            {/* Day header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `3.5rem repeat(${weekDays.length}, minmax(0, 1fr))`,
                gap: "0 0.25rem",
                marginBottom: "0.5rem",
              }}
            >
              <div />
              {weekDays.map((day) => {
                const key = formatDateKeyInTimezone(day, timezone);
                const items = grouped.get(key) ?? [];
                const isToday = key === todayDateKey;
                return (
                  <div
                    key={key}
                    className={`agenda-day-head ${isToday ? "agenda-day-head-today" : ""}`}
                  >
                    <p className="text-sm font-semibold capitalize text-[#001E5B]">
                      {formatDayShort(day.toISOString(), timezone)}
                    </p>
                    <p className="text-xs text-[#001E5B]/48">
                      {items.length} rendez-vous
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Time grid body */}
            <div
              className="time-grid-container"
              style={{
                gridTemplateColumns: `3.5rem repeat(${weekDays.length}, minmax(0, 1fr))`,
              }}
            >
              {/* Time axis column */}
              <div className="relative" style={{ height: TOTAL_HEIGHT_PX }}>
                {CALENDAR_HOURS.map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute right-2 text-right"
                    style={{ top: i * 2 * SLOT_HEIGHT_PX - 8 }}
                  >
                    <span className="text-xs text-[#001E5B]/36">{hour}:00</span>
                  </div>
                ))}
              </div>

              {/* 5 day columns */}
              {weekDays.map((day) => {
                const key = formatDateKeyInTimezone(day, timezone);
                const inRange = (grouped.get(key) ?? []).filter((e) =>
                  isEventInRange(e, timezone),
                );
                const tracked = assignTracks(inRange, timezone);
                const isToday = key === todayDateKey;

                return (
                  <div
                    key={key}
                    className={`time-grid-day-col ${isToday ? "time-grid-day-col-today" : ""}`}
                  >
                    {/* Horizontal slot lines */}
                    {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                      <div
                        key={i}
                        className={`time-grid-slot-line ${i % 2 === 0 ? "time-grid-slot-line-hour" : ""}`}
                        style={{ top: i * SLOT_HEIGHT_PX }}
                      />
                    ))}

                    {/* Event blocks */}
                    {tracked.map(({ entry, track, trackCount, top, height }) => {
                      const widthPct = 100 / Math.max(trackCount, 1);
                      const leftPct = track * widthPct;
                      const rightPct = 100 - leftPct - widthPct;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={`time-grid-event ${selectedBookingId === entry.id ? "time-grid-event-selected" : ""}`}
                          style={{
                            top,
                            height,
                            left: `calc(3px + ${leftPct}%)`,
                            right: `calc(3px + ${rightPct}%)`,
                          }}
                          onClick={() => onSelect(entry.id)}
                          title={`${entry.clientName} - ${entry.prospectName}`}
                        >
                          <p className="time-grid-event-time">
                            {formatTimeOnly(entry.startAt, timezone)}
                          </p>
                          <p className="time-grid-event-context">
                            {entry.clientName} - {entry.prospectName}
                          </p>
                          <StatusBadge
                            status={entry.displayStatus}
                            className="time-grid-event-badge"
                          />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
            <p className="font-semibold text-[#001E5B]">
              {booking.companyName}
            </p>
            <StatusBadge status={booking.displayStatus} />
          </div>
          <p className="text-sm text-[#001E5B]/64">
            {booking.prospectName} · {booking.clientName}
          </p>
          <p className="text-xs text-[#001E5B]/48">
            {formatRelativeShort(booking.startAt)} · {booking.callerName} →{" "}
            {booking.assignedRepName}
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
        <p>
          Motif: {task.triggerReason === "cancelled" ? "Annulation" : "No-show"}
        </p>
        <p>RDV source: {formatRelativeShort(task.sourceStartAt)}</p>
        <p>Échéance: {formatRelativeShort(task.dueAt)}</p>
      </div>
      {task.status === "open" ? (
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onDismiss(task.id)}
          >
            Dismiss
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
