"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type RainActivityChartDay = { date: string; rainfallMm: number };
export type RainActivityChartActivity = { date: string; typeName: string };

export function RainActivityChart({
  days,
  activities,
}: Readonly<{
  days: RainActivityChartDay[];
  activities: RainActivityChartActivity[];
}>) {
  const t = useTranslations("climate");

  const activityByDate = new Map<string, string[]>();
  for (const activity of activities) {
    const list = activityByDate.get(activity.date) ?? [];
    list.push(activity.typeName);
    activityByDate.set(activity.date, list);
  }

  const data = days.map((day) => ({
    date: day.date,
    rainfallMm: day.rainfallMm,
    activityLabel: activityByDate.get(day.date)?.join(", ") ?? null,
  }));

  const axisTick = {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    fill: "var(--muted-foreground)",
  };

  return (
    <div className="flex flex-col gap-2">
      <ResponsiveContainer width="100%" height={288}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={axisTick} stroke="var(--border)" />
          <YAxis tick={axisTick} stroke="var(--border)" allowDecimals={false} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as (typeof data)[number];
              return (
                <div className="rounded-[3px] border border-border bg-background p-2 font-mono text-[11px]">
                  <p className="font-semibold">{label}</p>
                  <p className="tabular">
                    {t("rainfall")}: {point.rainfallMm} mm
                  </p>
                  {point.activityLabel && (
                    <p>
                      {t("timelineActivity")}: {point.activityLabel}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="rainfallMm"
            name={t("rainfall")}
            fill="var(--accent-link)"
            fillOpacity={0.5}
            radius={[2, 2, 0, 0]}
          />
          {[...activityByDate.keys()].map((date) => (
            <ReferenceDot
              key={date}
              x={date}
              y={0}
              r={5}
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth={1}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {activityByDate.size > 0 && (
        <p className="font-mono text-[11px] text-muted-foreground">
          ● {t("timelineActivityHint")}
        </p>
      )}
    </div>
  );
}
