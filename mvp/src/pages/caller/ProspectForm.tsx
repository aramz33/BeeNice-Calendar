import type { FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@mvp/components/ui/button";
import { Input } from "@mvp/components/ui/input";
import { Label } from "@mvp/components/ui/label";
import { Textarea } from "@mvp/components/ui/textarea";
import type { FollowUpTask } from "@mvp/lib/types";

interface ProspectFormProps {
  prospectName: string;
  setProspectName: (v: string) => void;
  prospectEmail: string;
  setProspectEmail: (v: string) => void;
  companyName: string;
  setCompanyName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  selectedSlotLabel: string | null;
  sourceTask: FollowUpTask | null;
  onResetTask: () => void;
  onOpenConfirm: () => void;
  submitting: boolean;
}

export function ProspectForm({
  prospectName,
  setProspectName,
  prospectEmail,
  setProspectEmail,
  companyName,
  setCompanyName,
  notes,
  setNotes,
  selectedSlotLabel,
  sourceTask,
  onResetTask,
  onOpenConfirm,
  submitting,
}: ProspectFormProps) {
  const canSubmit = !!selectedSlotLabel && !!prospectName && !!prospectEmail && !!companyName;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) onOpenConfirm();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {sourceTask && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">
          <span>Repositionnement : {sourceTask.prospectName}</span>
          <button type="button" onClick={onResetTask} className="ml-2 hover:opacity-70">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="prospect-name">Nom du prospect</Label>
        <Input
          id="prospect-name"
          value={prospectName}
          onChange={(e) => setProspectName(e.target.value)}
          placeholder="Jean Martin"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="prospect-email">Email</Label>
        <Input
          id="prospect-email"
          type="email"
          value={prospectEmail}
          onChange={(e) => setProspectEmail(e.target.value)}
          placeholder="jean.martin@entreprise.com"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="company-name">Entreprise</Label>
        <Input
          id="company-name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Corp"
          required
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contexte de l'appel…"
          rows={3}
        />
      </div>

      {selectedSlotLabel && (
        <p className="text-sm text-[#001E5B]/64">
          Créneau sélectionné : <strong>{selectedSlotLabel}</strong>
        </p>
      )}

      <Button type="submit" disabled={!canSubmit || submitting} className="w-full">
        {submitting ? "Réservation…" : "Réserver"}
      </Button>
    </form>
  );
}
