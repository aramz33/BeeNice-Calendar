import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addWeeks,
  endOfDay,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { toast } from "sonner";
import { apiFetch } from "@mvp/lib/api";
import {
  formatDateKeyInTimezone,
  formatMonthYear,
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

export type ViewMode = "agenda" | "list" | "tasks" | "connections";

export function useAdminBookingsController() {
  const [payload, setPayload] = useState<AdminBookingsResponse | null>(null);
  const [calendar, setCalendar] = useState<AdminCalendarResponse | null>(null);
  const [tasksPayload, setTasksPayload] = useState<AdminTasksResponse | null>(null);
  const [settingsPayload, setSettingsPayload] = useState<SettingsPayload | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
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
  const visibleWeekEnd = useMemo(() => endOfDay(addDays(weekStart, 4)), [weekStart]);
  const weekDays = useMemo(() => getBusinessWeekDays(weekStartIso), [weekStartIso]);
  const agendaTimezone = payload?.timezone ?? "Europe/Paris";
  const weekLabel = useMemo(() => {
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
  const hasPreviousRescheduleWeek = rescheduleWeekStart > firstRescheduleWeekStart;
  const hasNextRescheduleWeek = rescheduleWeekStart < lastRescheduleWeekStart;
  const rescheduleSelectedSlot = useMemo(
    () =>
      rescheduleAvailability?.slots.find((slot) => slot.startAt === selectedRescheduleSlot) ??
      null,
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
        apiFetch<AdminBookingsResponse>(`/api/admin/bookings?${params.toString()}`),
        apiFetch<AdminCalendarResponse>(`/api/admin/calendar?${calendarParams.toString()}`),
        apiFetch<AdminTasksResponse>(`/api/admin/tasks?${params.toString()}`),
        apiFetch<SettingsPayload>("/api/admin/settings"),
      ]);

      setPayload(bookings);
      setCalendar(agenda);
      setTasksPayload(tasks);
      setSettingsPayload(settings);
      setSelectedBookingId((current) => current ?? bookings.bookings[0]?.id ?? null);
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
      const weekEnd = endOfDay(addDays(nextWeekStart, 6));
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
      window.history.replaceState({}, "", next ? `/admin/bookings?${next}` : "/admin/bookings");
    }
    if (connectionError) {
      toast.error(connectionError);
      params.delete("connectionError");
      const next = params.toString();
      window.history.replaceState({}, "", next ? `/admin/bookings?${next}` : "/admin/bookings");
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
  const selectedTaskCount =
    tasksPayload?.tasks.filter((task) => task.status === "open").length ?? 0;

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
    const clients = (settingsPayload?.clients ?? []).filter((client) => client.active);
    return clients.map((client) => ({
      client,
      reps: reps.filter((rep) => rep.clientId === client.id),
    }));
  }, [payload?.filters.reps, settingsPayload?.clients]);

  return {
    payload,
    calendar,
    tasksPayload,
    detail,
    loadingDashboard,
    loadingDetail,
    updatingBooking,
    statusReason,
    setStatusReason,
    rescheduleAvailability,
    selectedRescheduleSlot,
    setSelectedRescheduleSlot,
    loadingRescheduleAvailability,
    activeView,
    setActiveView,
    selectedBookingId,
    setSelectedBookingId,
    filters,
    setFilters,
    weekDays,
    agendaTimezone,
    todayDateKey,
    weekLabel,
    hasPreviousRescheduleWeek,
    hasNextRescheduleWeek,
    rescheduleSelectedSlot,
    integrationMode,
    liveConnectedCount,
    selectedTaskCount,
    connectionGroups,
    goToPreviousWeek: () => setWeekStartIso(subWeeks(weekStart, 1).toISOString()),
    goToCurrentWeek: () =>
      setWeekStartIso(startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()),
    goToNextWeek: () => setWeekStartIso(addWeeks(weekStart, 1).toISOString()),
    goToPreviousRescheduleWeek: () => {
      if (!detail || !hasPreviousRescheduleWeek) return;
      const nextWeek = subWeeks(rescheduleWeekStart, 1);
      setRescheduleWeekStartIso(nextWeek.toISOString());
      void fetchRescheduleAvailability(detail.booking.id, nextWeek, selectedRescheduleSlot);
    },
    goToNextRescheduleWeek: () => {
      if (!detail || !hasNextRescheduleWeek) return;
      const nextWeek = addWeeks(rescheduleWeekStart, 1);
      setRescheduleWeekStartIso(nextWeek.toISOString());
      void fetchRescheduleAvailability(detail.booking.id, nextWeek, selectedRescheduleSlot);
    },
    updateOutcome,
    cancelBooking,
    rescheduleBooking,
    dismissTask,
    buildInviteLink,
    copyInviteLink,
  };
}
