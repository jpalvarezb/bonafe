"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ClimateChartReading = {
  date: string;
  rainfallMm: string | null;
  tempMinC: string | null;
  tempMaxC: string | null;
};

export function ClimateCharts({
  readings,
}: Readonly<{ readings: ClimateChartReading[] }>) {
  const t = useTranslations("climate");

  const rainfallData = readings.map((r) => ({
    date: r.date,
    rainfallMm: r.rainfallMm !== null ? Number(r.rainfallMm) : null,
  }));

  const temperatureData = readings.map((r) => ({
    date: r.date,
    tempMinC: r.tempMinC !== null ? Number(r.tempMinC) : null,
    tempMaxC: r.tempMaxC !== null ? Number(r.tempMaxC) : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {t("chartRainfall")}
        </h3>
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={rainfallData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar
              dataKey="rainfallMm"
              name={t("rainfall")}
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {t("chartTemperature")}
        </h3>
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={temperatureData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="tempMaxC"
              name={t("tempMaxC")}
              stroke="#ef4444"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="tempMinC"
              name={t("tempMinC")}
              stroke="#60a5fa"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
