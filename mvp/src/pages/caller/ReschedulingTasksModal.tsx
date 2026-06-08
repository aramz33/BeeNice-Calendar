import { CalendarClock } from "lucide-react";
import { Button } from "@mvp/components/ui/button";
import { formatDateTime } from "@mvp/lib/time";
import type { FollowUpTask } from "@mvp/lib/types";

interface ReschedulingTasksModalProps {
  tasks: FollowUpTask[];
  onReposition: (task: FollowUpTask) => void;
  onDismiss: () => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  cancelled: "Annulé",
  no_show: "No-show",
};

export function ReschedulingTasksModal({ tasks, onReposition, onDismiss }: ReschedulingTasksModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#001E5B]/40 backdrop-blur-sm" onClick={onDismiss} />
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 font-display text-xl text-[#001E5B]">Tâches de repositionnement</h2>
        <p className="mb-4 text-sm text-[#001E5B]/64">
          {tasks.length} tâche{tasks.length > 1 ? "s" : ""} ouverte{tasks.length > 1 ? "s" : ""} à traiter.
        </p>

        <ul className="mb-4 max-h-72 space-y-3 overflow-y-auto">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#001E5B]/10 p-3">
              <div className="min-w-0">
                <p className="font-medium text-[#001E5B]">{task.prospectName}</p>
                <p className="text-sm text-[#001E5B]/64">{task.companyName} · {task.clientName}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-[#001E5B]/48">
                  <CalendarClock className="size-3" />
                  {formatDateTime(task.sourceStartAt, "Europe/Paris")}
                  {" · "}
                  {TRIGGER_LABELS[task.triggerReason] ?? task.triggerReason}
                </p>
              </div>
              <Button size="sm" onClick={() => onReposition(task)}>
                Repositionner
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onDismiss}>Plus tard</Button>
        </div>
      </div>
    </div>
  );
}
