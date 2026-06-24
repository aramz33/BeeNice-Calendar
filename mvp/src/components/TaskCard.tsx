import { Button } from "@mvp/components/ui/button";
import { formatRelativeShort } from "@mvp/lib/time";
import type { FollowUpTask, FollowUpTaskTrigger } from "@mvp/lib/types";

const TRIGGER_LABELS: Record<FollowUpTaskTrigger, string> = {
  cancelled: "Annulation",
  no_show: "No-show",
  mvn: "MVN",
};

export function TaskCard({
  task,
  onDismiss,
}: {
  task: FollowUpTask;
  onDismiss: (taskId: string) => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[#001E5B]/8 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#001E5B]">{task.companyName}</p>
          <p className="text-sm text-[#001E5B]/56">
            {task.prospectName} · {task.clientName} · {task.callerName}
          </p>
        </div>
        <div className="rounded-full border border-[#001E5B]/10 bg-[#F9F4ED] px-3 py-1 text-xs font-medium text-[#001E5B]">
          {task.status}
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm text-[#001E5B]/64">
        <p>Motif: {TRIGGER_LABELS[task.triggerReason] ?? task.triggerReason}</p>
        <p>RDV source: {formatRelativeShort(task.sourceStartAt)}</p>
        <p>Échéance: {formatRelativeShort(task.dueAt)}</p>
      </div>
      {task.status === "open" ? (
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onDismiss(task.id)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}
