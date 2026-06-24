import { Button } from "@mvp/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mvp/components/ui/dialog";

interface BookingConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  salutation: string;
  prospectFirstName: string;
  prospectLastName: string;
  prospectEmail: string;
  companyName: string;
  notes: string;
  slotLabel: string;
}

export function BookingConfirmDialog({
  open,
  onClose,
  onConfirm,
  submitting,
  salutation,
  prospectFirstName,
  prospectLastName,
  prospectEmail,
  companyName,
  notes,
  slotLabel,
}: BookingConfirmDialogProps) {
  const displaySalutation = salutation === "none" ? "" : salutation;
  const prospectDisplay = [displaySalutation, prospectFirstName, prospectLastName]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer la réservation</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <Row label="Prospect" value={prospectDisplay} />
          <Row label="Email" value={prospectEmail} />
          <Row label="Entreprise" value={companyName} />
          {notes && <Row label="Notes" value={notes} />}
          <Row label="Créneau" value={slotLabel} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Retour
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? "Réservation…" : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 font-medium text-[#001E5B]/64">{label}</span>
      <span className="text-[#001E5B]">{value}</span>
    </div>
  );
}
