"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CockpitLabor } from "@/server/reports/cockpit";
import type { AttendanceStatus } from "@/lib/calc/payroll";
import { DayStrip, dayStripClass } from "@/components/payroll/day-strip";
import { cn } from "@/lib/utils";
import { RailSection } from "./rail-section";

const STRIP_STATUSES: readonly AttendanceStatus[] = [
  "present",
  "half_day",
  "absent",
  "sick",
  "leave",
];

export function LaborWidget({
  orgSlug,
  labor,
}: {
  readonly orgSlug: string;
  readonly labor: CockpitLabor;
}) {
  const t = useTranslations("cockpit");
  // Reuses the same "attendance.statuses.*" keys the payroll period page
  // hands to DayStrip (day-strip.tsx doesn't translate — StatusChip idiom).
  const ta = useTranslations("attendance");

  const stripLabels: Record<AttendanceStatus | "none", string> = {
    present: ta("statuses.present"),
    half_day: ta("statuses.half_day"),
    absent: ta("statuses.absent"),
    sick: ta("statuses.sick"),
    leave: ta("statuses.leave"),
    none: t("rail.labor.noRecord"),
  };

  return (
    <RailSection title={t("rail.labor.title")}>
      {labor.topWorkers.length === 0 ? (
        <p className="px-3.5 text-[12px] text-muted-foreground">
          {t("rail.labor.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2 px-3.5">
          {labor.topWorkers.map((worker) => (
            <div key={worker.workerId} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[12px]">
                  {worker.workerName}
                </span>
                <span className="flex-none font-mono text-[10.5px] tabular text-muted-foreground">
                  {worker.daysWorked}
                </span>
              </div>
              <DayStrip
                days={worker.days}
                labels={stripLabels}
                label={t("rail.labor.stripLabel", { name: worker.workerName })}
              />
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
            {STRIP_STATUSES.map((status) => (
              <span
                key={status}
                title={stripLabels[status]}
                className="inline-flex items-center gap-1"
              >
                <span
                  aria-hidden="true"
                  className={cn("h-[10px] w-[6px] shrink-0", dayStripClass(status))}
                />
                <span className="sr-only">{stripLabels[status]}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="px-3.5 pt-1.5">
        <Link
          href={`/o/${orgSlug}/reports/labor`}
          className="text-[11px] text-accent-link hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("rail.labor.viewAll")}
        </Link>
      </div>
    </RailSection>
  );
}
