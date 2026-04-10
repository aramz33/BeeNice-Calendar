import { Badge } from "@shared-ui/badge";
import type { BookingStatus } from "@mvp/lib/types";

const badgeMap: Record<
  BookingStatus,
  { label: string; className: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  booked: {
    label: "Réservé",
    className: "text-primary",
    variant: "default",
  },
  completed: {
    label: "Validé",
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    variant: "outline",
  },
  no_show: {
    label: "No-show",
    className: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    variant: "outline",
  },
  cancelled: {
    label: "Annulé",
    className: "border-rose-500/30 bg-rose-500/15 text-rose-300",
    variant: "outline",
  },
  rescheduled: {
    label: "Replacé",
    className: "border-cyan-500/30 bg-cyan-500/15 text-cyan-300",
    variant: "outline",
  },
  not_qualified: {
    label: "Non qualifié",
    className: "border-violet-500/30 bg-violet-500/15 text-violet-300",
    variant: "outline",
  },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const config = badgeMap[status];
  return (
    <Badge variant={config.variant} className={config.className}>
      <span className="status-dot">{config.label}</span>
    </Badge>
  );
}
