import { useEffect, useRef } from "react";
import "temporal-polyfill/global";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import { createViewWeek } from "@schedule-x/calendar";
import type { CalendarEventExternal } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { createCalendarControlsPlugin } from "@schedule-x/calendar-controls";
import "@schedule-x/theme-default/dist/index.css";
import {
  CALENDARS,
  rangeStartToWeekStartIso,
  weekStartIsoToPlainDate,
} from "@mvp/lib/schedule-x";

interface ScheduleXWeekProps {
  events: CalendarEventExternal[];
  timezone: string;
  weekStartIso: string;
  onWeekStartChange: (weekStartIso: string) => void;
  onEventClick: (event: CalendarEventExternal) => void;
  minDate?: Temporal.PlainDate;
  maxDate?: Temporal.PlainDate;
  loading?: boolean;
}

function mondayOf(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.subtract({ days: date.dayOfWeek - 1 });
}

export function ScheduleXWeek({
  events,
  timezone,
  weekStartIso,
  onWeekStartChange,
  onEventClick,
  minDate,
  maxDate,
  loading = false,
}: ScheduleXWeekProps) {
  const eventsService = useRef(createEventsServicePlugin()).current;
  const calendarControls = useRef(createCalendarControlsPlugin()).current;

  const onEventClickRef = useRef(onEventClick);
  const onWeekStartChangeRef = useRef(onWeekStartChange);
  onEventClickRef.current = onEventClick;
  onWeekStartChangeRef.current = onWeekStartChange;

  const calendar = useCalendarApp({
    views: [createViewWeek()],
    timezone,
    firstDayOfWeek: 1,
    dayBoundaries: { start: "09:00", end: "18:00" },
    weekOptions: { nDays: 5, gridStep: 30 },
    isResponsive: false,
    selectedDate: weekStartIsoToPlainDate(weekStartIso),
    minDate,
    maxDate,
    calendars: CALENDARS,
    events,
    callbacks: {
      onEventClick: (event) => onEventClickRef.current(event),
      onRangeUpdate: (range) =>
        onWeekStartChangeRef.current(rangeStartToWeekStartIso(range.start)),
    },
    plugins: [eventsService, calendarControls],
  });

  useEffect(() => {
    eventsService.set(events);
  }, [events, eventsService]);

  useEffect(() => {
    const target = weekStartIsoToPlainDate(weekStartIso);
    let current: Temporal.PlainDate | undefined;
    try {
      current = calendarControls.getDate();
    } catch {
      current = undefined;
    }
    if (!current || !mondayOf(current).equals(target)) {
      calendarControls.setDate(target);
    }
  }, [weekStartIso, calendarControls]);

  useEffect(() => {
    try {
      calendarControls.setTimezone(timezone);
    } catch {
      // Calendar not ready yet; initial config already carries the timezone.
    }
  }, [timezone, calendarControls]);

  return (
    <div className="sx-react-calendar-wrapper" aria-busy={loading}>
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  );
}
