import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getISOWeek, getYear, parseISO, startOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";
import type { BookingSummary } from "@mvp/lib/types";

interface BookingsChartProps {
  bookings: BookingSummary[];
}

const STATUS_CONFIG = [
  { key: "scheduled", label: "Planifié", color: "#FFC755" },
  { key: "completed", label: "Honoré", color: "#00A86B" },
  { key: "rescheduled", label: "Déplacé", color: "#0ea5e9" },
  { key: "no_show", label: "No-show", color: "#7C3AED" },
  { key: "cancelled", label: "Annulé", color: "#b73039" },
  { key: "not_qualified", label: "Non qualifié", color: "#9ca3af" },
] as const;

type WeekData = {
  weekLabel: string;
  scheduled: number;
  completed: number;
  rescheduled: number;
  no_show: number;
  cancelled: number;
  not_qualified: number;
};

function getWeekKey(dateStr: string): string {
  const date = parseISO(dateStr);
  const year = getYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function getWeekLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return format(monday, "d MMM", { locale: fr });
}

export function BookingsChart({ bookings }: BookingsChartProps) {
  const data = useMemo<WeekData[]>(() => {
    const weekMap = new Map<string, WeekData>();

    for (const booking of bookings) {
      const key = getWeekKey(booking.startAt);
      if (!weekMap.has(key)) {
        weekMap.set(key, {
          weekLabel: getWeekLabel(booking.startAt),
          scheduled: 0,
          completed: 0,
          rescheduled: 0,
          no_show: 0,
          cancelled: 0,
          not_qualified: 0,
        });
      }
      const week = weekMap.get(key)!;
      const status = booking.displayStatus as keyof Omit<WeekData, "weekLabel">;
      if (status in week) {
        (week[status] as number) += 1;
      }
    }

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([, v]) => v);
  }, [bookings]);

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-[#001E5B]/44">
        Aucune donnée à afficher.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 11, fill: "rgba(0,30,91,0.5)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "rgba(0,30,91,0.5)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#FFFDF9",
            border: "1px solid rgba(0,30,91,0.12)",
            borderRadius: "12px",
            fontSize: 12,
          }}
          cursor={{ fill: "rgba(0,30,91,0.04)" }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
        {STATUS_CONFIG.map(({ key, label, color }) => (
          <Bar
            key={key}
            dataKey={key}
            name={label}
            stackId="a"
            fill={color}
            radius={key === "not_qualified" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
