import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@mvp/components/ui/card";
import { StatusBadge } from "@mvp/components/StatusBadge";
import {
  CALENDAR_HOURS,
  SLOT_HEIGHT_PX,
  TOTAL_HEIGHT_PX,
  TOTAL_SLOTS,
  assignTracks,
  isEventInRange,
  parseIsoSafe,
} from "@mvp/lib/calendar";
import {
  formatDateKeyInTimezone,
  formatDayShort,
  formatTimeOnly,
} from "@mvp/lib/time";
import type { BookingSummary } from "@mvp/lib/types";

export function AgendaBoard({
  loading,
  entries,
  weekDays,
  selectedBookingId,
  onSelect,
  timezone,
  todayDateKey,
}: {
  loading: boolean;
  entries: BookingSummary[];
  weekDays: Date[];
  selectedBookingId: string | null;
  onSelect: (id: string) => void;
  timezone: string;
  todayDateKey: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, BookingSummary[]>();
    weekDays.forEach((day) => {
      map.set(formatDateKeyInTimezone(day, timezone), []);
    });
    entries.forEach((entry) => {
      const startAt = parseIsoSafe(entry.startAt);
      if (!startAt) return;

      const key = formatDateKeyInTimezone(startAt, timezone);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(entry);
    });
    map.forEach((items) =>
      items.sort((left, right) => left.startAt.localeCompare(right.startAt)),
    );
    return map;
  }, [entries, timezone, weekDays]);

  return (
    <Card className="surface-card overflow-x-auto">
      <CardHeader>
        <CardTitle>Agenda semaine</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: weekDays.length }).map((_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-[1.5rem] bg-[#001E5B]/5"
              />
            ))}
          </div>
        ) : (
          <div style={{ minWidth: "680px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `3.5rem repeat(${weekDays.length}, minmax(0, 1fr))`,
                gap: "0 0.25rem",
                marginBottom: "0.5rem",
              }}
            >
              <div />
              {weekDays.map((day) => {
                const key = formatDateKeyInTimezone(day, timezone);
                const items = grouped.get(key) ?? [];
                const isToday = key === todayDateKey;
                return (
                  <div
                    key={key}
                    className={`agenda-day-head ${isToday ? "agenda-day-head-today" : ""}`}
                  >
                    <p className="text-sm font-semibold capitalize text-[#001E5B]">
                      {formatDayShort(day.toISOString(), timezone)}
                    </p>
                    <p className="text-xs text-[#001E5B]/48">
                      {items.length} rendez-vous
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "360px" }}>
              <div
                className="time-grid-container"
                style={{
                  gridTemplateColumns: `3.5rem repeat(${weekDays.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="relative" style={{ height: TOTAL_HEIGHT_PX }}>
                  {CALENDAR_HOURS.map((hour, i) => (
                    <div
                      key={hour}
                      className="absolute right-2 text-right"
                      style={{ top: i * 2 * SLOT_HEIGHT_PX - 8 }}
                    >
                      <span className="text-xs text-[#001E5B]/36">
                        {hour}:00
                      </span>
                    </div>
                  ))}
                </div>

                {weekDays.map((day) => {
                  const key = formatDateKeyInTimezone(day, timezone);
                  const inRange = (grouped.get(key) ?? []).filter((e) =>
                    isEventInRange(e, timezone),
                  );
                  const tracked = assignTracks(inRange, timezone);
                  const isToday = key === todayDateKey;

                  return (
                    <div
                      key={key}
                      className={`time-grid-day-col ${isToday ? "time-grid-day-col-today" : ""}`}
                      style={{ height: TOTAL_HEIGHT_PX }}
                    >
                      {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                        <div
                          key={i}
                          className={`time-grid-slot-line ${i % 2 === 0 ? "time-grid-slot-line-hour" : ""}`}
                          style={{ top: i * SLOT_HEIGHT_PX }}
                        />
                      ))}

                      {tracked.map(
                        ({ entry, track, trackCount, top, height }) => {
                          const widthPct = 100 / Math.max(trackCount, 1);
                          const leftPct = track * widthPct;
                          const rightPct = 100 - leftPct - widthPct;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className={`time-grid-event ${selectedBookingId === entry.id ? "time-grid-event-selected" : ""}`}
                              style={{
                                top,
                                height,
                                left: `calc(3px + ${leftPct}%)`,
                                right: `calc(3px + ${rightPct}%)`,
                              }}
                              onClick={() => onSelect(entry.id)}
                              title={`${entry.clientName} - ${entry.prospectName}`}
                            >
                              <p className="time-grid-event-time">
                                {formatTimeOnly(entry.startAt, timezone)}
                              </p>
                              <p className="time-grid-event-context">
                                {entry.clientName} - {entry.prospectName}
                              </p>
                              <StatusBadge
                                status={entry.displayStatus}
                                className="time-grid-event-badge"
                              />
                            </button>
                          );
                        },
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
