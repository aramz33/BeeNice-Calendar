import { CalendarClock } from "lucide-react";
import { Button } from "@mvp/components/ui/button";
import { formatDateTime } from "@mvp/lib/time";
import type { FollowUpTask } from "@mvp/lib/types";

interface ReschedulingTasksListProps {
  tasks: FollowUpTask[];
  onReposition: (task: FollowUpTask) => void;
  timezone: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  cancelled: "Annulé",
  no_show: "No-show",
};

export function ReschedulingTasksList({ tasks, onReposition, timezone }: ReschedulingTasksListProps) {
  if (tasks.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-[#001E5B]/64 uppercase tracking-wide">
        Tâches ouvertes
      </h3>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start justify-between gap-2 rounded-xl border border-[#001E5B]/10 bg-amber-50/50 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#001E5B]">{task.prospectName}</p>
              <p className="text-xs text-[#001E5B]/64">{task.companyName}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-[#001E5B]/48">
                <CalendarClock className="size-3" />
                {formatDateTime(task.sourceStartAt, timezone)}
                {" · "}
                {TRIGGER_LABELS[task.triggerReason] ?? task.triggerReason}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onReposition(task)}>
              Repositionner
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
