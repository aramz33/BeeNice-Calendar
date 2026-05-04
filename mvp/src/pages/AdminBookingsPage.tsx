import {
  ArrowRightLeft,
  Cable,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  ListTodo,
} from "lucide-react";
import { Button } from "@mvp/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@mvp/components/ui/card";
import { Input } from "@mvp/components/ui/input";
import { Label } from "@mvp/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mvp/components/ui/select";
import { AgendaBoard } from "@mvp/components/AgendaBoard";
import { AppChrome } from "@mvp/components/AppChrome";
import { BookingDetailPanel } from "@mvp/components/BookingDetailPanel";
import { BookingListItem } from "@mvp/components/BookingListItem";
import { MetricCard } from "@mvp/components/MetricCard";
import { TaskCard } from "@mvp/components/TaskCard";
import { formatRepSeniority } from "@mvp/lib/format";
import { formatRelativeShort } from "@mvp/lib/time";
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
    goToPreviousWeek,
    goToCurrentWeek,
    goToNextWeek,
    goToPreviousRescheduleWeek,
    goToNextRescheduleWeek,
    updateOutcome,
    cancelBooking,
    rescheduleBooking,
    dismissTask,
    buildInviteLink,
    copyInviteLink,
  } = useAdminBookingsController();

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
                    onClick={goToPreviousWeek}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={goToCurrentWeek}
                  >
                    Aujourd'hui
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={goToNextWeek}
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
          onPreviousRescheduleWeek={goToPreviousRescheduleWeek}
          onNextRescheduleWeek={goToNextRescheduleWeek}
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
