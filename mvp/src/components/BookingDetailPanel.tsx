import {
  Ban,
  CheckCheck,
  Clock3,
  PhoneOff,
  Settings2,
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
import { SlotPicker } from "@mvp/components/SlotPicker";
import { StatusBadge } from "@mvp/components/StatusBadge";
import { formatDateTime, formatRelativeShort } from "@mvp/lib/time";
import type {
  AvailabilityResponse,
  BookingDetailResponse,
} from "@mvp/lib/types";

type AvailabilitySlot = AvailabilityResponse["slots"][number];
type OutcomeState =
  | "completed"
  | "no_show"
  | "not_qualified"
  | "mvn"
  | "refused";

export function BookingDetailPanel({
  loading,
  detail,
  updatingBooking,
  statusReason,
  onStatusReasonChange,
  onUpdateOutcome,
  onCancelBooking,
  rescheduleAvailability,
  selectedRescheduleSlot,
  onSelectRescheduleSlot,
  loadingRescheduleAvailability,
  hasPreviousRescheduleWeek,
  hasNextRescheduleWeek,
  onPreviousRescheduleWeek,
  onNextRescheduleWeek,
  rescheduleSelectedSlot,
  onRescheduleBooking,
  bare = false,
}: {
  loading: boolean;
  detail: BookingDetailResponse | null;
  updatingBooking: boolean;
  statusReason: string;
  onStatusReasonChange: (reason: string) => void;
  onUpdateOutcome: (state: OutcomeState) => void;
  onCancelBooking: () => void;
  rescheduleAvailability: AvailabilityResponse | null;
  selectedRescheduleSlot: string | null;
  onSelectRescheduleSlot: (slot: string | null) => void;
  loadingRescheduleAvailability: boolean;
  hasPreviousRescheduleWeek: boolean;
  hasNextRescheduleWeek: boolean;
  onPreviousRescheduleWeek: () => void;
  onNextRescheduleWeek: () => void;
  rescheduleSelectedSlot: AvailabilitySlot | null;
  onRescheduleBooking: () => void;
  bare?: boolean;
}) {
  const content = (
    <div className="space-y-5">
      {loading ? (
        <div className="h-96 animate-pulse rounded-2xl bg-[#001E5B]/5" />
      ) : detail ? (
        <>
          <div className="space-y-3 rounded-2xl border border-[#001E5B]/8 bg-white px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[#001E5B]">
                  {detail.booking.companyName}
                </p>
                <p className="text-sm text-[#001E5B]/56">
                  {detail.booking.prospectName} · {detail.booking.clientName}
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
                  Tâche liée: {detail.booking.linkedTask.status} · échéance{" "}
                  {formatRelativeShort(detail.booking.linkedTask.dueAt)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-[#001E5B]/8 bg-white px-4 py-4">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-[#001E5B]/40">
              Raison d'assignation
            </p>
            <div className="mt-3 grid gap-2 text-sm text-[#001E5B]/72">
              <p>
                Mode de routing:{" "}
                {detail.booking.assignmentReason.routingMode === "percentage"
                  ? "Répartition par pourcentage"
                  : detail.booking.assignmentReason.routingMode ===
                      "weighted_seniority"
                    ? "Routing senior/junior"
                    : "Pool unique"}
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
              onChange={(event) => onStatusReasonChange(event.target.value)}
              placeholder="Ex: prospect absent, à rappeler demain."
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="rounded-full"
              disabled={updatingBooking}
              onClick={() => onUpdateOutcome("completed")}
            >
              <CheckCheck className="h-4 w-4" />
              Honoré
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={updatingBooking}
              onClick={() => onUpdateOutcome("no_show")}
            >
              <Clock3 className="h-4 w-4" />
              No-show
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={updatingBooking}
              onClick={() => onUpdateOutcome("not_qualified")}
            >
              <Settings2 className="h-4 w-4" />
              Non qualifié
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={updatingBooking}
              onClick={() => onUpdateOutcome("mvn")}
            >
              <PhoneOff className="h-4 w-4" />
              MVN
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={updatingBooking}
              onClick={() => onUpdateOutcome("refused")}
            >
              <Ban className="h-4 w-4" />
              Refus
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-rose-200 text-rose-700"
              disabled={updatingBooking}
              onClick={onCancelBooking}
            >
              <XCircle className="h-4 w-4" />
              Annuler
            </Button>
          </div>

          <div className="space-y-4 rounded-2xl border border-dashed border-[#001E5B]/12 bg-[#F9F4ED] px-4 py-4">
            <div className="space-y-2">
              <Label>Déplacer selon les disponibilités</Label>
              <p className="text-sm text-[#001E5B]/64">
                Le nouveau créneau est choisi sur les disponibilités live du
                client. Le routage réassigne automatiquement le rendez-vous au
                rep éligible disponible sur ce créneau.
              </p>
            </div>

            <SlotPicker
              availability={rescheduleAvailability}
              selectedSlot={selectedRescheduleSlot}
              onSelect={onSelectRescheduleSlot}
              loading={loadingRescheduleAvailability}
              onPreviousWeek={onPreviousRescheduleWeek}
              onNextWeek={onNextRescheduleWeek}
              hasPreviousWeek={hasPreviousRescheduleWeek}
              hasNextWeek={hasNextRescheduleWeek}
            />

            {rescheduleSelectedSlot ? (
              <div className="rounded-2xl border border-[#001E5B]/8 bg-white px-4 py-4 text-sm text-[#001E5B]/72">
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
              onClick={onRescheduleBooking}
            >
              Déplacer le rendez-vous
            </Button>
          </div>

          <div className="space-y-3">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-[#001E5B]/44">
              Timeline
            </p>
            {detail.timeline.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-[#001E5B]/8 bg-white px-4 py-4"
              >
                <p className="font-medium text-[#001E5B]">{event.actorLabel}</p>
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
        <div className="rounded-2xl border border-dashed border-[#001E5B]/12 px-4 py-10 text-center text-sm text-[#001E5B]/44">
          Sélectionnez un rendez-vous pour afficher son détail.
        </div>
      )}
    </div>
  );

  if (bare) return content;

  return (
    <Card className="surface-card overflow-y-auto">
      <CardHeader>
        <CardTitle>Détail du rendez-vous</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
