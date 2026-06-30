import { useMemo } from "react";
import { ArrowRightLeft, CalendarRange, ListTodo } from "lucide-react";
import { Button } from "@mvp/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@mvp/components/ui/card";
import { Input } from "@mvp/components/ui/input";
import { Label } from "@mvp/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mvp/components/ui/select";
import { ScheduleXWeek } from "@mvp/components/calendar/ScheduleXWeek";
import { forwardMaxPlainDate, bookingsToEvents } from "@mvp/lib/schedule-x";
import { AppChrome } from "@mvp/components/AppChrome";
import { BookingListItem } from "@mvp/components/BookingListItem";
import { BookingSheet } from "@mvp/components/BookingSheet";
import { BookingsChart } from "@mvp/components/BookingsChart";
import { MetricCard } from "@mvp/components/MetricCard";
import { TaskCard } from "@mvp/components/TaskCard";
import { useAdminBookingsController } from "./admin-bookings/useAdminBookingsController";

export function AdminBookingsPage() {
  const {
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
    rescheduleWeekStartIso,
    handleRescheduleWeekChange,
    activeView,
    setActiveView,
    selectedBookingId,
    setSelectedBookingId,
    filters,
    setFilters,
    agendaTimezone,
    agendaWeekStartIso,
    handleAgendaWeekChange,
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
  } = useAdminBookingsController();

  const selectedBooking =
    payload?.bookings.find((b) => b.id === selectedBookingId) ?? null;

  const agendaEvents = useMemo(
    () => bookingsToEvents(calendar?.entries ?? [], selectedBookingId),
    [calendar?.entries, selectedBookingId],
  );

  return (
    <AppChrome title="Admin">
      <div className="space-y-6">
        {/* Métriques */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="Planifiés"
            value={payload?.counts.scheduled ?? 0}
            helper="Rendez-vous au planning."
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

        {/* Graphe d'activité hebdomadaire */}
        {payload && payload.bookings.length > 0 && (
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Activité hebdomadaire</CardTitle>
            </CardHeader>
            <CardContent>
              <BookingsChart bookings={payload.bookings} />
            </CardContent>
          </Card>
        )}

        {/* Filtres */}
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Filtres</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="min-w-[180px] flex-1 space-y-2">
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
            <div className="min-w-[140px] flex-1">
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
            </div>
            <div className="min-w-[140px] flex-1">
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
            </div>
            <div className="min-w-[140px] flex-1">
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
            </div>
            <div className="min-w-[140px] flex-1">
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
            </div>
            {activeView === "list" && (
              <div className="min-w-[140px] flex-1">
                <FilterSelect
                  id="week-filter"
                  label="Semaine"
                  value={filters.weekScope}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      weekScope: value as "all" | "current",
                    }))
                  }
                  options={[{ id: "current", name: "Semaine en cours" }]}
                  allLabel="Toutes les semaines"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Onglets + navigation semaine */}
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
              label="Liste"
            />
            <ViewButton
              active={activeView === "tasks"}
              onClick={() => setActiveView("tasks")}
              icon={ListTodo}
              label="Tâches"
            />
          </div>
        </div>

        {/* Contenu des vues */}
        {activeView === "agenda" && (
          <ScheduleXWeek
            events={agendaEvents}
            timezone={agendaTimezone}
            weekStartIso={agendaWeekStartIso}
            onWeekStartChange={handleAgendaWeekChange}
            onEventClick={(event) => setSelectedBookingId(String(event.id))}
            maxDate={forwardMaxPlainDate()}
            loading={loadingDashboard}
            dayBoundaries={{ start: "07:00", end: "21:00" }}
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
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-2xl bg-[#001E5B]/5"
                  />
                ))
              ) : payload?.bookings.length ? (
                payload.bookings.map((booking) => (
                  <BookingListItem
                    key={booking.id}
                    booking={booking}
                    selected={booking.id === selectedBookingId}
                    onSelect={setSelectedBookingId}
                  />
                ))
              ) : (
                <EmptyState message="Aucun rendez-vous ne correspond à ces filtres." />
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
      </div>

      {/* Sheet détail — overlay portal */}
      <BookingSheet
        open={!!selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        bookingTitle={selectedBooking?.companyName ?? ""}
        bookingIndex={selectedBookingIndex}
        bookingCount={payload?.bookings.length ?? 0}
        hasPreviousBooking={hasPreviousBooking}
        hasNextBooking={hasNextBooking}
        onPreviousBooking={goToPreviousBooking}
        onNextBooking={goToNextBooking}
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
        rescheduleWeekStartIso={rescheduleWeekStartIso}
        onRescheduleWeekChange={handleRescheduleWeekChange}
        rescheduleSelectedSlot={rescheduleSelectedSlot}
        onRescheduleBooking={() => void rescheduleBooking()}
      />
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
    <div className="rounded-2xl border border-dashed border-[#001E5B]/12 px-4 py-10 text-center text-sm text-[#001E5B]/44">
      {message}
    </div>
  );
}
