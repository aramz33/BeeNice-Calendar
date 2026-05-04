import { Badge } from "@mvp/components/ui/badge";
import { cn } from "@mvp/components/ui/utils";
import type { BookingStatus } from "@mvp/lib/types";

const badgeMap: Record<
  BookingStatus,
  { label: string; className: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: {
    label: "Planifié",
    className: "border-[#001E5B]/10 bg-[#001E5B] text-white",
    variant: "default",
  },
  completed: {
    label: "Honoré",
    className: "border-emerald-700/15 bg-emerald-50 text-emerald-800",
    variant: "outline",
  },
  no_show: {
    label: "No-show",
    className: "border-[#F7A600]/20 bg-[#FFF3DA] text-[#9C6400]",
    variant: "outline",
  },
  cancelled: {
    label: "Annulé",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    variant: "outline",
  },
  rescheduled: {
    label: "Déplacé",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    variant: "outline",
  },
  not_qualified: {
    label: "Non qualifié",
    className: "border-stone-200 bg-stone-100 text-stone-700",
    variant: "outline",
  },
};

const fallbackBadge = {
  label: "Statut inconnu",
  className: "border-[#001E5B]/10 bg-[#F9F4ED] text-[#001E5B]",
  variant: "outline" as const,
};

function normalizeStatus(status: string | undefined): BookingStatus | null {
  if (!status) {
    return null;
  }
  if (status in badgeMap) {
    return status as BookingStatus;
  }
  if (status === "booked") {
    return "scheduled";
  }
  return null;
}

export function getStatusBadgeConfig(status: BookingStatus | string | undefined) {
  const normalizedStatus = normalizeStatus(status);
  return normalizedStatus ? badgeMap[normalizedStatus] : fallbackBadge;
}

export function StatusBadge({
  status,
  className,
}: {
  status: BookingStatus | string | undefined;
  className?: string;
}) {
  const config = getStatusBadgeConfig(status);
  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      <span className="status-dot">{config.label}</span>
    </Badge>
  );
}
