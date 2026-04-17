import { eachDayOfInterval, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { formatInTimeZone } from "date-fns-tz";

export function formatSlotDay(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, "EEEE d MMMM", { locale: fr });
}

export function formatSlotTime(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, "HH:mm");
}

export function formatDateTime(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, "EEEE d MMMM • HH:mm", { locale: fr });
}

export function formatRelativeShort(iso: string) {
  return format(parseISO(iso), "dd/MM • HH:mm", { locale: fr });
}

export function formatDayShort(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, "EEE d", { locale: fr });
}

export function formatTimeOnly(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, "HH:mm");
}

export function formatDateShort(iso: string) {
  return format(parseISO(iso), "dd/MM/yyyy", { locale: fr });
}

export function getWeekDays(referenceIso: string) {
  const reference = parseISO(referenceIso);
  return eachDayOfInterval({
    start: startOfWeek(reference, { weekStartsOn: 1 }),
    end: endOfWeek(reference, { weekStartsOn: 1 }),
  });
}
