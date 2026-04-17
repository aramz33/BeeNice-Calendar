import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";

interface MetricCardProps {
  label: string;
  value: string | number;
  helper: string;
}

export function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <Card className="surface-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-[0.15em] text-[#001E5B]/40">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="metric-value text-3xl font-semibold tracking-tight text-[#001E5B]">
          {value}
        </div>
        <p className="text-sm text-[#001E5B]/56">{helper}</p>
      </CardContent>
    </Card>
  );
}
