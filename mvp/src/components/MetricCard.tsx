import { Card, CardContent, CardHeader, CardTitle } from "@shared-ui/card";

interface MetricCardProps {
  label: string;
  value: string | number;
  helper: string;
}

export function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <Card className="surface-card border-l-4 border-l-[#F7A600]">
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-xs uppercase tracking-[0.15em] text-[#001E5B]/40">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-center">
        <div className="metric-value font-display text-4xl font-semibold tracking-[-0.06em] text-[#001E5B]">
          {value}
        </div>
        <p className="text-sm text-[#001E5B]/56">{helper}</p>
      </CardContent>
    </Card>
  );
}
