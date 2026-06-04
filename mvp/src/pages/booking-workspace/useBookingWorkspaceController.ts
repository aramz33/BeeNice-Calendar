import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addWeeks, endOfWeek, parseISO, startOfWeek, subWeeks } from "date-fns";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { apiFetch } from "@mvp/lib/api";
import { formatDateTime } from "@mvp/lib/time";
import type {
  AvailabilityResponse,
  BookingLinkResponse,
  BookingSummary,
  CallerBookingsResponse,
  FollowUpTask,
  PublicWorkspace,
} from "@mvp/lib/types";

const CALLER_STORAGE_KEY = "benice-mvp-caller";
const WEEK_STARTS_ON = 1;
const BOOKING_WINDOW_WEEKS = 12;

export function useBookingWorkspaceController() {
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
  const workspaceOptions = useMemo<PublicWorkspace[]>(() => {
    if (payload?.workspaces?.length) {
      return payload.workspaces;
    }

    if (!payload) {
      return [];
    }

    return [
      {
        id: payload.bookingLink.id,
        slug: payload.bookingLink.slug,
        clientId: payload.bookingLink.clientId ?? payload.bookingLink.slug,
        clientName: payload.bookingLink.clientName,
        title: payload.bookingLink.title,
        timezone: payload.bookingLink.timezone,
      },
    ];
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
        if (!ignore) {
          setLoadingMeta(false);
        }
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
  ) => {
    setLoadingAvailability(true);
    try {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON });
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      const data = await apiFetch<AvailabilityResponse>(
        `/api/book/${slug}/availability?${params.toString()}`,
      );
      setAvailability(data);
      setSelectedSlot(
        preferredSlot &&
          data.slots.some((slot) => slot.startAt === preferredSlot)
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
  }, [slug, availabilityWeekStartIso]);

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
  }, [slug, callerId, availabilityWeekStartIso]);

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

    setAvailabilityWeekStartIso(subWeeks(currentWeekStart, 1).toISOString());
  };

  const handleNextAvailabilityWeek = () => {
    if (!hasNextAvailabilityWeek) {
      return;
    }

    setAvailabilityWeekStartIso(addWeeks(currentWeekStart, 1).toISOString());
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
      setCompanyName(booking.companyName);
      setProspectName(booking.prospectName);
      setProspectEmail(booking.prospectEmail);
      setNotes(booking.notes ?? "");
      setAvailabilityWeekStartIso(bookingWeekStart.toISOString());
      await Promise.all([
        fetchAvailability(booking.startAt, bookingWeekStart),
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSlot) {
      toast.error("Choisissez un créneau avant de réserver.");
      return;
    }
    if (!callerId || !prospectName || !prospectEmail || !companyName) {
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
          companySize: 0,
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

  return {
    payload,
    availability,
    loadingMeta,
    loadingAvailability,
    submitting,
    cancellingBookingId,
    callerId,
    setCallerId,
    selectedSlot,
    setSelectedSlot,
    prospectName,
    setProspectName,
    prospectEmail,
    setProspectEmail,
    companyName,
    setCompanyName,
    notes,
    setNotes,
    sourceTask,
    tasks,
    recentBookings,
    clientName,
    workspaceOptions,
    selectedSlotLabel,
    hasPreviousAvailabilityWeek,
    hasNextAvailabilityWeek,
    handleTaskSelect,
    handleWorkspaceChange,
    resetTask,
    handlePreviousAvailabilityWeek,
    handleNextAvailabilityWeek,
    handleCancelBooking,
    handleSubmit,
  };
}
