import { format, parseISO } from "date-fns";
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
