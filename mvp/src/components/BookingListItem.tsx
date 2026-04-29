import { StatusBadge } from "@mvp/components/StatusBadge";
import { formatRelativeShort } from "@mvp/lib/time";
import type { BookingSummary } from "@mvp/lib/types";

export function BookingListItem({
  booking,
  selected,
  onSelect,
}: {
  booking: BookingSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(booking.id)}
      className={`w-full rounded-[1.25rem] border px-4 py-4 text-left transition ${
        selected
          ? "border-[#F7A600] bg-[#FFF7E8]"
          : "border-[#001E5B]/8 bg-white hover:border-[#001E5B]/16"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[#001E5B]">
              {booking.companyName}
            </p>
            <StatusBadge status={booking.displayStatus} />
          </div>
          <p className="text-sm text-[#001E5B]/64">
            {booking.prospectName} · {booking.clientName}
          </p>
          <p className="text-xs text-[#001E5B]/48">
            {formatRelativeShort(booking.startAt)} · {booking.callerName} →{" "}
            {booking.assignedRepName}
          </p>
        </div>
      </div>
    </button>
  );
}
