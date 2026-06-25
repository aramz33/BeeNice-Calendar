import { useEffect, useMemo, useState } from "react";
import { addDays, endOfDay, parseISO, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { apiFetch } from "@mvp/lib/api";
import type {
  AdminBookingsResponse,
  AdminCalendarResponse,
  AdminTasksResponse,
  AvailabilityResponse,
  BookingDetailResponse,
} from "@mvp/lib/types";

export type ViewMode = "agenda" | "list" | "tasks";

export function useAdminBookingsController() {
  const [payload, setPayload] = useState<AdminBookingsResponse | null>(null);
  const [calendar, setCalendar] = useState<AdminCalendarResponse | null>(null);
  const [tasksPayload, setTasksPayload] = useState<AdminTasksResponse | null>(
    null,
  );
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
  const [filters, setFilters] = useState({
    status: "all",
    clientId: "all",
    callerId: "all",
    repId: "all",
    query: "",
    weekScope: "all" as "all" | "current",
  });

  const weekStart = useMemo(() => parseISO(weekStartIso), [weekStartIso]);
  const visibleWeekEnd = useMemo(
    () => endOfDay(addDays(weekStart, 4)),
    [weekStart],
  );
  const agendaTimezone = payload?.timezone ?? "Europe/Paris";
  const firstRescheduleWeekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    [],
  );
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
      if (filters.weekScope === "current") {
        params.set("from", weekStart.toISOString());
        params.set("to", visibleWeekEnd.toISOString());
      }

      const calendarParams = new URLSearchParams(params);
      calendarParams.set("from", weekStart.toISOString());
      calendarParams.set("to", visibleWeekEnd.toISOString());

      const [bookings, agenda, tasks] = await Promise.all([
        apiFetch<AdminBookingsResponse>(
          `/api/admin/bookings?${params.toString()}`,
        ),
        apiFetch<AdminCalendarResponse>(
          `/api/admin/calendar?${calendarParams.toString()}`,
        ),
        apiFetch<AdminTasksResponse>(`/api/admin/tasks?${params.toString()}`),
      ]);

      setPayload(bookings);
      setCalendar(agenda);
      setTasksPayload(tasks);
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
    nextWeekStart: Date = parseISO(rescheduleWeekStartIso),
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
    filters.weekScope,
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

  const liveConnectedCount =
    payload?.filters.reps.filter((rep) => rep.connectionStatus === "connected")
      .length ?? 0;
  const selectedTaskCount =
    tasksPayload?.tasks.filter((task) => task.status === "open").length ?? 0;

  const bookingList = payload?.bookings ?? [];
  const selectedBookingIndex = bookingList.findIndex(
    (b) => b.id === selectedBookingId,
  );
  const hasPreviousBooking = selectedBookingIndex > 0;
  const hasNextBooking = selectedBookingIndex < bookingList.length - 1;

  const goToPreviousBooking = () => {
    if (!hasPreviousBooking) return;
    setSelectedBookingId(bookingList[selectedBookingIndex - 1]!.id);
  };

  const goToNextBooking = () => {
    if (!hasNextBooking) return;
    setSelectedBookingId(bookingList[selectedBookingIndex + 1]!.id);
  };

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
        parseISO(rescheduleWeekStartIso),
        null,
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUpdatingBooking(false);
    }
  };

  const handleAgendaWeekChange = (nextWeekStartIso: string) => {
    setWeekStartIso(nextWeekStartIso);
  };

  const handleRescheduleWeekChange = (nextWeekStartIso: string) => {
    if (nextWeekStartIso === rescheduleWeekStartIso) return;
    setRescheduleWeekStartIso(nextWeekStartIso);
    if (detail) {
      void fetchRescheduleAvailability(
        detail.booking.id,
        parseISO(nextWeekStartIso),
        null,
      );
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
    agendaTimezone,
    agendaWeekStartIso: weekStartIso,
    handleAgendaWeekChange,
    rescheduleWeekStartIso,
    handleRescheduleWeekChange,
    rescheduleSelectedSlot,
    liveConnectedCount,
    selectedTaskCount,
    selectedBookingIndex,
    hasPreviousBooking,
    hasNextBooking,
    goToPreviousBooking,
    goToNextBooking,
    updateOutcome,
    cancelBooking,
    rescheduleBooking,
    dismissTask,
  };
}
