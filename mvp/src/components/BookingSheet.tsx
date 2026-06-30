import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@mvp/components/ui/button";
import { BookingDetailPanel } from "@mvp/components/BookingDetailPanel";
import type {
  AvailabilityResponse,
  BookingDetailResponse,
} from "@mvp/lib/types";

type AvailabilitySlot = AvailabilityResponse["slots"][number];
type OutcomeState = "completed" | "no_show" | "not_qualified" | "refused";

interface BookingSheetProps {
  open: boolean;
  onClose: () => void;
  bookingTitle: string;
  bookingIndex: number;
  bookingCount: number;
  hasPreviousBooking: boolean;
  hasNextBooking: boolean;
  onPreviousBooking: () => void;
  onNextBooking: () => void;
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
  rescheduleWeekStartIso: string;
  onRescheduleWeekChange: (weekStartIso: string) => void;
  rescheduleSelectedSlot: AvailabilitySlot | null;
  onRescheduleBooking: () => void;
}

export function BookingSheet({
  open,
  onClose,
  bookingTitle,
  bookingIndex,
  bookingCount,
  hasPreviousBooking,
  hasNextBooking,
  onPreviousBooking,
  onNextBooking,
  ...panelProps
}: BookingSheetProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#001E5B]/20 backdrop-blur-[2px] data-[state=closed]:animate-[fadeOut_200ms_ease] data-[state=open]:animate-[fadeIn_200ms_ease]" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col bg-[#FFFDF9] shadow-[−20px_0_60px_rgba(0,30,91,0.12)] outline-none data-[state=closed]:animate-[slideOutRight_250ms_ease] data-[state=open]:animate-[slideInRight_250ms_ease]"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-[#001E5B]/8 px-5 py-4">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                disabled={!hasPreviousBooking}
                onClick={onPreviousBooking}
                aria-label="Rendez-vous précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[3rem] text-center text-xs text-[#001E5B]/44">
                {bookingIndex + 1} / {bookingCount}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                disabled={!hasNextBooking}
                onClick={onNextBooking}
                aria-label="Rendez-vous suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Dialog.Title className="flex-1 truncate font-semibold text-[#001E5B]">
              {bookingTitle || "Rendez-vous"}
            </Dialog.Title>

            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <BookingDetailPanel {...panelProps} bare />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
