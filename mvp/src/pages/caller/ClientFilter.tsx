import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mvp/components/ui/select";
import type { CallerWorkspace } from "@mvp/lib/types";

interface ClientFilterProps {
  workspaces: CallerWorkspace[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  loading: boolean;
}

export function ClientFilter({ workspaces, selectedSlug, onSelect, loading }: ClientFilterProps) {
  return (
    <Select value={selectedSlug ?? ""} onValueChange={onSelect} disabled={loading}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Sélectionnez un client" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((ws) => (
          <SelectItem key={ws.id} value={ws.slug}>
            {ws.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
