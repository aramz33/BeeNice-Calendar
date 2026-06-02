import { useState, type FormEvent } from "react";
import {
  CalendarClock,
  Loader2,
  RotateCcw,
  Users,
  XCircle,
} from "lucide-react";
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
import { Textarea } from "@mvp/components/ui/textarea";
import { AppChrome } from "@mvp/components/AppChrome";
import { AccordionSection } from "@mvp/components/AccordionSection";
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
  const [submitted, setSubmitted] = useState(false);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(
    null,
  );

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
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface-card h-64 animate-pulse" />
          <div className="surface-card h-64 animate-pulse" />
        </div>
      </AppChrome>
    );
  }

  const connectedRepCount = payload.bookingLink.reps.filter(
    (rep) => rep.connectionStatus === "connected",
  ).length;

  const onSubmit = (event: FormEvent) => {
    setSubmitted(true);
    handleSubmit(event);
  };

  return (
    <AppChrome title={`Workspace caller · ${clientName}`}>
      <div className="space-y-6">
        {/* Zone d'action principale — 2 colonnes desktop, 1 colonne mobile */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Colonne gauche — contexte + formulaire */}
          <Card className="surface-card">
            <CardHeader>
              <CardTitle>Prise de rendez-vous</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Sélection client / caller / taille */}
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
                      <SelectValue placeholder="Choisir" />
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

              {/* Banner repositionnement actif */}
              {sourceTask ? (
                <div className="rounded-2xl border border-[#F7A600]/20 bg-[#FFF6E4] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#001E5B]">
                        Repositionnement : {sourceTask.companyName}
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

              {/* Formulaire prospect — rempli pendant l'appel */}
              <form className="space-y-4" onSubmit={onSubmit} id="booking-form">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Nom du prospect"
                    id="prospect-name"
                    value={prospectName}
                    onChange={setProspectName}
                    placeholder="Ex : Marie Dupont"
                    error={submitted && !prospectName.trim()}
                  />
                  <Field
                    label="Email du prospect"
                    id="prospect-email"
                    value={prospectEmail}
                    onChange={setProspectEmail}
                    type="email"
                    placeholder="Ex : marie@entreprise.com"
                    error={submitted && !prospectEmail.trim()}
                  />
                  <Field
                    label="Entreprise appelée"
                    id="company-name"
                    value={companyName}
                    onChange={setCompanyName}
                    placeholder="Ex : Acme SAS"
                    error={submitted && !companyName.trim()}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="notes">Contexte</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Signaux, objections, contexte..."
                    />
                  </div>
                </div>
              </form>

              {/* Créneau sélectionné */}
              <div className="rounded-2xl border border-[#001E5B]/8 bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#001E5B]/40">
                  Créneau sélectionné
                </p>
                <p
                  className={`mt-1.5 font-semibold ${selectedSlot ? "text-[#001E5B]" : "text-[#001E5B]/40"}`}
                >
                  {selectedSlotLabel}
                </p>
              </div>

              {/* Bouton réserver */}
              <Button
                type="submit"
                form="booking-form"
                className="w-full rounded-full"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarClock className="h-4 w-4" />
                )}
                {submitting
                  ? "Réservation en cours..."
                  : "Réserver le rendez-vous"}
              </Button>
            </CardContent>
          </Card>

          {/* Colonne droite — disponibilités */}
          <div className="space-y-4">
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
            {connectedRepCount > 0 && (
              <p className="px-1 text-xs text-[#001E5B]/44">
                {connectedRepCount} rep{connectedRepCount > 1 ? "s" : ""}{" "}
                connecté{connectedRepCount > 1 ? "s" : ""} · créneaux consolidés
                en direct
              </p>
            )}
          </div>
        </div>

        {/* Sections secondaires — repliées par défaut */}
        <div className="space-y-3">
          <AccordionSection
            title="Tâches de repositionnement"
            count={tasks.length}
          >
            {tasks.length ? (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-[1rem] border border-[#001E5B]/8 bg-[#F9F4ED] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#001E5B]">
                          {task.companyName}
                        </p>
                        <p className="text-sm text-[#001E5B]/56">
                          {task.prospectName} · {task.clientName}
                        </p>
                        <p className="mt-1 text-xs text-[#001E5B]/48">
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
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#001E5B]/44">
                Aucune relance à traiter pour ce caller sur ce client.
              </p>
            )}
          </AccordionSection>

          <AccordionSection
            title="Rendez-vous récents"
            count={recentBookings.length}
          >
            {recentBookings.length ? (
              <div className="space-y-3">
                {recentBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-[1rem] border border-[#001E5B]/8 bg-[#F9F4ED] px-4 py-3"
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
                          <p className="mt-1 text-xs text-[#001E5B]/48">
                            {formatRelativeShort(booking.startAt)}
                          </p>
                        </div>
                        {booking.taskId ? (
                          <div className="rounded-full border border-[#F7A600]/20 bg-[#FFF6E4] px-3 py-1 text-xs font-medium text-[#9C6400]">
                            Relance ouverte
                          </div>
                        ) : booking.cancelMode === "admin_only" ? (
                          <div className="rounded-full border border-[#001E5B]/10 bg-white px-3 py-1 text-xs font-medium text-[#001E5B]">
                            Annulation via admin
                          </div>
                        ) : null}
                      </div>
                      {booking.canCancel ? (
                        <div className="flex justify-end">
                          {confirmingCancelId === booking.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[#001E5B]/64">
                                Confirmer l'annulation ?
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="rounded-full"
                                onClick={() => {
                                  setConfirmingCancelId(null);
                                  void handleCancelBooking(booking);
                                }}
                                disabled={cancellingBookingId === booking.id}
                              >
                                Annuler le RDV
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={() => setConfirmingCancelId(null)}
                              >
                                Non
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full border-rose-200 text-rose-700"
                              onClick={() => setConfirmingCancelId(booking.id)}
                              disabled={cancellingBookingId === booking.id}
                            >
                              <XCircle className="h-4 w-4" />
                              Annuler et rebooker
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#001E5B]/44">
                Aucun rendez-vous récent pour ce caller sur ce client.
              </p>
            )}
          </AccordionSection>

          <AccordionSection
            title="Pool connecté"
            count={payload.bookingLink.reps.length}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {payload.bookingLink.reps.map((rep) => (
                <div
                  key={rep.id}
                  className="flex items-center gap-3 rounded-[1rem] border border-[#001E5B]/8 bg-white px-4 py-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F9F4ED] text-[#001E5B]">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#001E5B]">{rep.name}</p>
                    <p className="text-xs text-[#001E5B]/56">
                      {formatRepSeniority(rep.seniority)} ·{" "}
                      {rep.connectionStatus}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        </div>
      </div>
    </AppChrome>
  );
}

interface FieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: boolean;
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
}: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        <span className="ml-1 text-destructive">*</span>
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error}
      />
      {error && (
        <p className="text-xs text-destructive">Ce champ est requis.</p>
      )}
    </div>
  );
}
