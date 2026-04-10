import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";

interface MetricCardProps {
  label: string;
  value: string | number;
  helper: string;
}

export function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <Card className="glass-card rounded-[1.25rem] border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="metric-value text-3xl font-semibold tracking-tight">
          {value}
        </div>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}
