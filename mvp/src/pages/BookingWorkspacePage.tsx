import { CalendarClock, RotateCcw, Users, XCircle } from "lucide-react";
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
import { Textarea } from "@mvp/components/ui/textarea";
import { AppChrome } from "@mvp/components/AppChrome";
import { MetricCard } from "@mvp/components/MetricCard";
import { SlotPicker } from "@mvp/components/SlotPicker";
import { StatusBadge } from "@mvp/components/StatusBadge";
import { formatRepSeniority } from "@mvp/lib/format";
import { formatRelativeShort } from "@mvp/lib/time";
import { useBookingWorkspaceController } from "./booking-workspace/useBookingWorkspaceController";

const COMPANY_SIZE_OPTIONS = [
  { label: "1 à 49 salariés", value: "49" },
  { label: "50 à 199 salariés", value: "150" },
  { label: "200 à 499 salariés", value: "250" },
  { label: "500+ salariés", value: "500" },
];

export function BookingWorkspacePage() {
  const {
    payload,
    availability,
    loadingMeta,
    loadingAvailability,
    submitting,
    cancellingBookingId,
    callerId,
    setCallerId,
    companySize,
    setCompanySize,
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
    eligiblePoolLabel,
    hasPreviousAvailabilityWeek,
    hasNextAvailabilityWeek,
    handleTaskSelect,
    handleWorkspaceChange,
    resetTask,
    handlePreviousAvailabilityWeek,
    handleNextAvailabilityWeek,
    handleCancelBooking,
    handleSubmit,
  } = useBookingWorkspaceController();

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
              <CardTitle>Rendez-vous du caller pour ce client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[#001E5B]/56">
                Les rendez-vous a venir restent visibles ici. L'action
                <span className="font-medium text-[#001E5B]">
                  {" "}
                  Annuler et rebooker
                </span>{" "}
                reste disponible jusqu'au debut du rendez-vous.
              </p>
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
                        {formatRepSeniority(rep.seniority)} ·{" "}
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
