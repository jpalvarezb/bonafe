"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CockpitPlanning } from "@/server/reports/cockpit";
import { RailSection } from "./rail-section";

export function PlanningWidget({
  orgSlug,
  planning,
}: {
  readonly orgSlug: string;
  readonly planning: CockpitPlanning;
}) {
  const t = useTranslations("cockpit");
  const format = useFormatter();

  return (
    <RailSection title={t("rail.planning.title")}>
      {planning.upcoming.length === 0 ? (
        <p className="px-3.5 text-[12px] text-muted-foreground">
          {t("rail.planning.empty")}
        </p>
      ) : (
        <div className="flex flex-col">
          {planning.upcoming.map((item) => (
            <div key={item.id} className="flex gap-2.5 px-3.5 py-1 text-[12px]">
              <span className="w-9 flex-none font-mono text-[10.5px] tabular text-muted-foreground">
                {format.dateTime(new Date(`${item.date}T00:00:00Z`), {
                  day: "2-digit",
                  month: "short",
                  timeZone: "UTC",
                })}
              </span>
              <span className="min-w-0 flex-1 truncate leading-tight">
                {item.typeName}
              </span>
              {item.parcelName && (
                <span className="flex-none truncate font-mono text-[10.5px] text-muted-foreground">
                  {item.parcelName}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="px-3.5 pt-1.5">
        <Link
          href={`/o/${orgSlug}/planning`}
          className="text-[11px] text-accent-link hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("rail.planning.viewAll")}
        </Link>
      </div>
    </RailSection>
  );
}
