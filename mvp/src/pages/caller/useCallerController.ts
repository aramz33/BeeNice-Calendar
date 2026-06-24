import { useEffect, useMemo, useState } from "react";
import { addWeeks, endOfWeek, parseISO, startOfWeek, subWeeks } from "date-fns";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { apiFetch } from "@mvp/lib/api";
import { TASKS_MODAL_SHOWN_KEY } from "@mvp/lib/auth";
import { useSession } from "@mvp/lib/session";
import { formatDateTime } from "@mvp/lib/time";
import type {
  AvailabilityResponse,
  CallerBookingsResponse,
  CallerTasksResponse,
  CallerWorkspace,
  CallerWorkspacesResponse,
  FollowUpTask,
} from "@mvp/lib/types";

const WEEK_STARTS_ON = 1;
const BOOKING_WINDOW_WEEKS = 12;

export function useCallerController() {
  const { session } = useSession();
  const callerId = session?.user.callerId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlug = searchParams.get("workspace") ?? null;

  const [workspaces, setWorkspaces] = useState<CallerWorkspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null,
  );
  const [callerData, setCallerData] = useState<CallerBookingsResponse | null>(
    null,
  );
  const [openTasks, setOpenTasks] = useState<FollowUpTask[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalDismissed, setModalDismissed] = useState(
    () => !!sessionStorage.getItem(TASKS_MODAL_SHOWN_KEY),
  );
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [salutation, setSalutation] = useState("");
  const [prospectFirstName, setProspectFirstName] = useState("");
  const [prospectLastName, setProspectLastName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceTask, setSourceTask] = useState<FollowUpTask | null>(null);

  const [availabilityWeekStartIso, setAvailabilityWeekStartIso] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON }).toISOString(),
  );

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

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.slug === selectedSlug) ?? null,
    [workspaces, selectedSlug],
  );
  const timezone = selectedWorkspace?.timezone ?? "Europe/Paris";
  const tasks = callerData?.tasks ?? [];

  const showTasksModal = openTasks.length > 0 && !modalDismissed;

  const selectedSlotLabel = selectedSlot
    ? formatDateTime(selectedSlot, timezone)
    : null;

  useEffect(() => {
    let ignore = false;
    setLoadingWorkspaces(true);
    apiFetch<CallerWorkspacesResponse>("/api/caller/workspaces")
      .then((data) => {
        if (!ignore) setWorkspaces(data.workspaces);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => {
        if (!ignore) setLoadingWorkspaces(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    apiFetch<CallerTasksResponse>("/api/caller/tasks")
      .then((data) => {
        if (!ignore) setOpenTasks(data.tasks ?? []);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const fetchAvailability = async (
    preferredSlot: string | null = selectedSlot,
    weekStart: Date = currentWeekStart,
  ) => {
    if (!selectedSlug) return;
    setLoadingAvailability(true);
    try {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON });
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      const data = await apiFetch<AvailabilityResponse>(
        `/api/book/${selectedSlug}/availability?${params.toString()}`,
      );
      setAvailability(data);
      setSelectedSlot(
        preferredSlot && data.slots.some((s) => s.startAt === preferredSlot)
          ? preferredSlot
          : null,
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const fetchCallerData = async () => {
    if (!selectedSlug || !callerId) return;
    try {
      const data = await apiFetch<CallerBookingsResponse>(
        `/api/book/${selectedSlug}/bookings`,
      );
      setCallerData(data);
      setSourceTask((current) =>
        current ? (data.tasks.find((t) => t.id === current.id) ?? null) : null,
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  useEffect(() => {
    if (!selectedSlug) {
      setAvailability(null);
      setCallerData(null);
      return;
    }
    void fetchAvailability();
  }, [selectedSlug, availabilityWeekStartIso]);

  useEffect(() => {
    if (selectedSlug) void fetchCallerData();
  }, [selectedSlug, callerId]);

  useEffect(() => {
    if (!selectedSlug) return;
    const source = new EventSource(`/api/book/${selectedSlug}/stream`);
    source.addEventListener("availability.updated", () => {
      void fetchAvailability();
      void fetchCallerData();
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [selectedSlug, callerId, availabilityWeekStartIso]);

  const handleWorkspaceSelect = (slug: string) => {
    setSearchParams({ workspace: slug });
    setAvailability(null);
    setSelectedSlot(null);
    setSourceTask(null);
    setSalutation("");
    setProspectFirstName("");
    setProspectLastName("");
    setProspectEmail("");
    setCompanyName("");
    setNotes("");
    setAvailabilityWeekStartIso(firstBookableWeekStart.toISOString());
  };

  const handleTaskSelect = (task: FollowUpTask, closeModal = false) => {
    if (closeModal) dismissModal();
    if (task.clientId) {
      const ws = workspaces.find((w) => w.id === task.clientId);
      if (ws && ws.slug !== selectedSlug) {
        handleWorkspaceSelect(ws.slug);
      }
    }
    setSourceTask(task);
    setCompanyName(task.companyName);
    setSalutation("");
    setProspectFirstName(task.prospectName);
    setProspectLastName("");
    setNotes(task.notes ?? "");
    toast.success("Contexte de repositionnement chargé.");
  };

  const resetTask = () => {
    setSourceTask(null);
    setSalutation("");
    setProspectFirstName("");
    setProspectLastName("");
    setCompanyName("");
    setNotes("");
  };

  const dismissModal = () => {
    sessionStorage.setItem(TASKS_MODAL_SHOWN_KEY, "1");
    setModalDismissed(true);
  };

  const handlePreviousAvailabilityWeek = () => {
    if (hasPreviousAvailabilityWeek)
      setAvailabilityWeekStartIso(subWeeks(currentWeekStart, 1).toISOString());
  };

  const handleNextAvailabilityWeek = () => {
    if (hasNextAvailabilityWeek)
      setAvailabilityWeekStartIso(addWeeks(currentWeekStart, 1).toISOString());
  };

  const handleSubmit = async () => {
    if (
      !selectedSlug ||
      !selectedSlot ||
      !callerId ||
      !prospectFirstName ||
      !prospectLastName ||
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
      }>(`/api/book/${selectedSlug}/bookings`, {
        method: "POST",
        body: JSON.stringify({
          callerId,
          companySize: 0,
          companyName,
          salutation: salutation === "none" ? "" : salutation,
          prospectFirstName,
          prospectLastName,
          prospectEmail,
          notes,
          slotStart: selectedSlot,
          sourceTaskId: sourceTask?.id ?? null,
        }),
      });
      toast.success(`Rendez-vous réservé chez ${result.assignedRepName}.`);
      setSalutation("");
      setProspectFirstName("");
      setProspectLastName("");
      setProspectEmail("");
      setCompanyName("");
      setNotes("");
      setSelectedSlot(null);
      setSourceTask(null);
      setShowConfirmDialog(false);
      await Promise.all([fetchAvailability(), fetchCallerData()]);
    } catch (err) {
      toast.error((err as Error).message);
      await fetchAvailability();
    } finally {
      setSubmitting(false);
    }
  };

  return {
    workspaces,
    selectedSlug,
    selectedWorkspace,
    availability,
    openTasks,
    tasks,
    loadingWorkspaces,
    loadingAvailability,
    submitting,
    showTasksModal,
    dismissModal,
    showConfirmDialog,
    setShowConfirmDialog,
    selectedSlot,
    setSelectedSlot,
    selectedSlotLabel,
    salutation,
    setSalutation,
    prospectFirstName,
    setProspectFirstName,
    prospectLastName,
    setProspectLastName,
    prospectEmail,
    setProspectEmail,
    companyName,
    setCompanyName,
    notes,
    setNotes,
    sourceTask,
    timezone,
    hasPreviousAvailabilityWeek,
    hasNextAvailabilityWeek,
    handleWorkspaceSelect,
    handleTaskSelect,
    resetTask,
    handlePreviousAvailabilityWeek,
    handleNextAvailabilityWeek,
    handleSubmit,
  };
}
