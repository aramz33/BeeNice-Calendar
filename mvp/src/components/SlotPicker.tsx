import { useMemo } from "react";
import { getDay } from "date-fns";
import { format } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Clock3, Sparkles } from "lucide-react";
import { Button } from "@mvp/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@mvp/components/ui/card";
import type { AvailabilityResponse } from "@mvp/lib/types";
import {
  formatDateShortInTimezone,
  formatDayShort,
  formatSlotTime,
  getWeekDays,
} from "@mvp/lib/time";

interface SlotPickerProps {
  availability: AvailabilityResponse | null;
  selectedSlot: string | null;
  onSelect: (slotStart: string) => void;
  loading: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  hasPreviousWeek: boolean;
  hasNextWeek: boolean;
}

export function SlotPicker({
  availability,
  selectedSlot,
  onSelect,
  loading,
  onPreviousWeek,
  onNextWeek,
  hasPreviousWeek,
  hasNextWeek,
}: SlotPickerProps) {
  const weekDays = useMemo(() => {
    if (!availability) {
      return [];
    }

    return getWeekDays(availability.windowStart).filter((day) => {
      const weekday = getDay(day);
      return weekday >= 1 && weekday <= 5;
    });
  }, [availability]);

  const grouped = useMemo(() => {
    if (!availability) {
      return [];
    }

    const map = new Map<
      string,
      Array<AvailabilityResponse["slots"][number]>
    >();

    for (const day of weekDays) {
      map.set(
        formatInTimeZone(day, availability.timezone, "yyyy-MM-dd"),
        [],
      );
    }

    for (const slot of availability.slots) {
      const key = formatInTimeZone(
        slot.startAt,
        availability.timezone,
        "yyyy-MM-dd",
      );
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(slot);
    }

    return weekDays.map((day) => {
      const key = formatInTimeZone(day, availability.timezone, "yyyy-MM-dd");
      return {
        key,
        label: formatDayShort(day.toISOString(), availability.timezone),
        slots: map.get(key) ?? [],
      };
    });
  }, [availability, weekDays]);

  if (loading) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Disponibilités en direct</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Consolidation des agendas du client en cours...
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-2xl bg-[#001E5B]/5" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!availability) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Disponibilités en direct</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <p className="text-sm">
              Choisissez d’abord une tranche de société pour charger une
              semaine de disponibilités.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="surface-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Disponibilités en direct</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Navigation hebdomadaire sur 12 semaines. Les créneaux disparaissent
            dès qu’un autre caller les réserve.
          </p>
        </div>
        <div className="rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs text-[#001E5B]">
          Live sync
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WeekNavigator
          availability={availability}
          onPreviousWeek={onPreviousWeek}
          onNextWeek={onNextWeek}
          hasPreviousWeek={hasPreviousWeek}
          hasNextWeek={hasNextWeek}
        />
        {availability.slots.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <p className="text-sm">
              Aucun créneau disponible sur cette semaine pour ce niveau de
              qualification.
            </p>
          </div>
        ) : null}
        <div className="slot-grid">
          {grouped.map(({ key, label, slots }) => (
            <div key={key} className="slot-column space-y-3">
              <div className="rounded-2xl bg-muted/40 px-4 py-3">
                <p className="text-sm font-medium capitalize">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {slots.length} créneau{slots.length > 1 ? "x" : ""}
                </p>
              </div>
              <div className="space-y-2">
                {slots.length > 0 ? (
                  slots.map((slot) => {
                    const isSelected = selectedSlot === slot.startAt;
                    return (
                      <Button
                        key={slot.startAt}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        className="slot-button h-auto px-4 py-3"
                        onClick={() => onSelect(slot.startAt)}
                      >
                        <Clock3 className="h-4 w-4 shrink-0" />
                        <div className="flex min-w-0 flex-col items-start">
                          <span className="font-semibold">
                            {formatSlotTime(slot.startAt, availability.timezone)}
                          </span>
                          <span className="text-xs opacity-75">
                            {slot.availableRepCount} rep
                            {slot.availableRepCount > 1 ? "s" : ""} dispo
                          </span>
                        </div>
                      </Button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#001E5B]/12 bg-white px-4 py-6 text-sm text-[#001E5B]/44">
                    Aucun créneau
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Fenêtre de réservation mise à jour le{" "}
          {format(new Date(), "dd/MM à HH:mm", { locale: fr })}.
        </p>
      </CardContent>
    </Card>
  );
}

function WeekNavigator({
  availability,
  onPreviousWeek,
  onNextWeek,
  hasPreviousWeek,
  hasNextWeek,
}: {
  availability: AvailabilityResponse;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  hasPreviousWeek: boolean;
  hasNextWeek: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={onPreviousWeek}
        disabled={!hasPreviousWeek}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="rounded-full border border-[#001E5B]/10 bg-white px-4 py-2 text-center text-sm font-medium text-[#001E5B]">
        {formatDateShortInTimezone(availability.windowStart, availability.timezone)}{" "}
        → {formatDateShortInTimezone(availability.windowEnd, availability.timezone)}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={onNextWeek}
        disabled={!hasNextWeek}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
