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
  ChevronLeft,
  ChevronRight,
  Copy,
  ListTodo,
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
import { AgendaBoard } from "@mvp/components/AgendaBoard";
import { AppChrome } from "@mvp/components/AppChrome";
import { BookingDetailPanel } from "@mvp/components/BookingDetailPanel";
import { BookingListItem } from "@mvp/components/BookingListItem";
import { MetricCard } from "@mvp/components/MetricCard";
import { TaskCard } from "@mvp/components/TaskCard";
import { apiFetch } from "@mvp/lib/api";
import { formatRepSeniority } from "@mvp/lib/format";
import {
  formatDateKeyInTimezone,
  formatMonthYear,
  formatRelativeShort,
  getBusinessWeekDays,
} from "@mvp/lib/time";
import type {
  AdminBookingsResponse,
  AdminCalendarResponse,
  AdminTasksResponse,
  AvailabilityResponse,
  BookingDetailResponse,
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
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<
    string | null
  >(null);
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
        if (current) return current;
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
        preferredSlot &&
          data.slots.some((slot) => slot.startAt === preferredSlot)
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
    if (!detail) return;

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
      await fetchRescheduleAvailability(
        detail.booking.id,
        rescheduleWeekStart,
        null,
      );
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
    if (!inviteToken) return "";
    const relativePath = `/connect/${inviteToken}`;
    if (typeof window === "undefined") return relativePath;
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

  const connectionGroups = useMemo(() => {
    const reps = payload?.filters.reps ?? [];
    const clients = (settingsPayload?.clients ?? []).filter(
      (client) => client.active,
    );
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
                        startOfWeek(new Date(), {
                          weekStartsOn: 1,
                        }).toISOString(),
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
                      ? "Les changements du calendrier client sont remontés dans l'agenda admin via Nylas."
                      : "Mode démo: connexions simulées pour tester l'agenda live sans provider externe."}
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
                          Lien generique a envoyer aux reps du client pour
                          qu'ils connectent eux-memes leur agenda.
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
                            void copyInviteLink(
                              group.client.connectionInviteToken,
                            )
                          }
                        >
                          <Copy className="h-4 w-4" />
                          Copier le lien
                        </Button>
                        <a
                          href={buildInviteLink(
                            group.client.connectionInviteToken,
                          )}
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
                                  {rep.businessEmail
                                    ? ` · ${rep.businessEmail}`
                                    : ""}
                                </p>
                                <div className="mt-2 space-y-1 text-xs text-[#001E5B]/56">
                                  {rep.providerEmail ? (
                                    <p>Calendrier: {rep.providerEmail}</p>
                                  ) : null}
                                  {rep.connectedAt ? (
                                    <p>
                                      Connecté:{" "}
                                      {formatRelativeShort(rep.connectedAt)}
                                    </p>
                                  ) : null}
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
                                    <p className="text-rose-600">
                                      {rep.lastError}
                                    </p>
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

        <BookingDetailPanel
          loading={loadingDetail}
          detail={detail}
          updatingBooking={updatingBooking}
          statusReason={statusReason}
          onStatusReasonChange={setStatusReason}
          onUpdateOutcome={(state) => void updateOutcome(state)}
          onCancelBooking={() => void cancelBooking()}
          rescheduleAvailability={rescheduleAvailability}
          selectedRescheduleSlot={selectedRescheduleSlot}
          onSelectRescheduleSlot={setSelectedRescheduleSlot}
          loadingRescheduleAvailability={loadingRescheduleAvailability}
          hasPreviousRescheduleWeek={hasPreviousRescheduleWeek}
          hasNextRescheduleWeek={hasNextRescheduleWeek}
          onPreviousRescheduleWeek={() => {
            if (!detail || !hasPreviousRescheduleWeek) return;
            const nextWeek = subWeeks(rescheduleWeekStart, 1);
            setRescheduleWeekStartIso(nextWeek.toISOString());
            void fetchRescheduleAvailability(
              detail.booking.id,
              nextWeek,
              selectedRescheduleSlot,
            );
          }}
          onNextRescheduleWeek={() => {
            if (!detail || !hasNextRescheduleWeek) return;
            const nextWeek = addWeeks(rescheduleWeekStart, 1);
            setRescheduleWeekStartIso(nextWeek.toISOString());
            void fetchRescheduleAvailability(
              detail.booking.id,
              nextWeek,
              selectedRescheduleSlot,
            );
          }}
          rescheduleSelectedSlot={rescheduleSelectedSlot}
          onRescheduleBooking={() => void rescheduleBooking()}
        />
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[#001E5B]/12 px-4 py-10 text-center text-sm text-[#001E5B]/44">
      {message}
    </div>
  );
}
