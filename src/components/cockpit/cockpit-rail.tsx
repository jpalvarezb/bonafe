"use client";

import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CockpitParcel } from "@/server/reports/cockpit";
import { Metric } from "@/components/ui/metric";
import { SyncIssuesList } from "@/components/offline/sync-issues-list";
import { PendingEntries } from "@/components/offline/pending-entries";
import { MoneyValue } from "./money-value";

type Props = {
  readonly orgSlug: string;
  readonly currencyCode: string;
  readonly farmName: string;
  readonly parcelCount: number;
  readonly totalAreaHa: number;
  readonly activeCyclesCount: number;
  readonly selected: CockpitParcel | null;
};

function fmtHa(value: string | number | null): string {
  if (value == null) return "—";
  return Number(value).toFixed(2);
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="border-r border-b border-border px-3.5 py-2 [&:nth-child(2n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-[13px]">{children}</div>
    </div>
  );
}

const SYNC_KINDS = ["activity.create", "monitoring.create", "workorder.complete"] as const;

export function CockpitRail({
  orgSlug,
  currencyCode,
  farmName,
  parcelCount,
  totalAreaHa,
  activeCyclesCount,
  selected,
}: Props) {
  const t = useTranslations("cockpit");
  const format = useFormatter();

  return (
    <div className="flex h-full w-[340px] flex-col overflow-hidden border border-border bg-background/95">
      {selected ? (
        <>
          <div className="border-b border-border px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="border border-border px-[5px] py-px font-mono text-[9px] text-muted-foreground uppercase">
                ⌖ {t("rail.focused")}
              </span>
            </div>
            <div className="mt-1.5 text-[17px] font-semibold">{selected.name}</div>
            {selected.cycles.length > 1 && (
              <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                {t("rail.moreCycles", { count: selected.cycles.length - 1 })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 border-b border-border">
            <Field label={t("rail.crop")}>
              {selected.primaryCycle?.cropName ?? t("rail.noCycle")}
            </Field>
            <Field label={t("rail.area")}>
              <span className="font-mono tabular">{fmtHa(selected.areaHa)} ha</span>
            </Field>
            <Field label={t("rail.cycle")}>
              {selected.primaryCycle ? (
                <Link
                  href={`/o/${orgSlug}/cycles?cycleId=${selected.primaryCycle.id}`}
                  className="text-accent-link hover:underline"
                >
                  {selected.primaryCycle.name}
                </Link>
              ) : (
                t("rail.noCycle")
              )}
            </Field>
            <Field label={t("rail.stage")}>
              {selected.primaryCycle?.stageName ?? t("legend.noStage")}
            </Field>
            <Field label={t("rail.costHa")}>
              <MoneyValue amount={selected.costPerHa ?? 0} currency={currencyCode} />
            </Field>
            <Field label={t("rail.margin")}>
              {selected.margin?.marginPct != null ? (
                <Metric value={`${selected.margin.marginPct}%`} signed />
              ) : (
                <span className="text-muted-foreground">{t("rail.noMargin")}</span>
              )}
            </Field>
          </div>

          <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
            <span className="text-[12px] text-muted-foreground">{t("rail.rainfall")}</span>
            <span className="font-mono text-[13px] font-semibold tabular">
              {selected.rainfall ? Number(selected.rainfall.totalMm).toFixed(1) : "—"} mm
            </span>
          </div>

          <div className="px-3.5 pt-2.5 pb-1 font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
            {t("rail.recentActivities")}
          </div>
          {selected.recentActivities.length === 0 ? (
            <p className="px-3.5 pb-2.5 text-[12px] text-muted-foreground">
              {t("rail.noActivities")}
            </p>
          ) : (
            <div className="flex flex-col pb-2">
              {selected.recentActivities.map((activity) => (
                <div key={activity.id} className="flex gap-2.5 px-3.5 py-1 text-[12px]">
                  <span className="w-9 flex-none font-mono text-[10.5px] tabular text-muted-foreground">
                    {format.dateTime(new Date(`${activity.date}T00:00:00Z`), {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <Link
                    href={`/o/${orgSlug}/activities`}
                    className="text-accent-link leading-tight hover:underline"
                  >
                    {activity.typeName}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="border-b border-border px-3.5 py-3">
          <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
            {t("rail.farmSummaryTitle")}
          </div>
          <div className="mt-1 text-[15px] font-semibold">{farmName}</div>
          <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <dt className="font-mono text-[10px] text-muted-foreground uppercase">
                {t("rail.farmParcels")}
              </dt>
              <dd className="font-mono tabular">{parcelCount}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] text-muted-foreground uppercase">
                {t("rail.farmArea")}
              </dt>
              <dd className="font-mono tabular">{totalAreaHa.toFixed(2)} ha</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] text-muted-foreground uppercase">
                {t("rail.farmActiveCycles")}
              </dt>
              <dd className="font-mono tabular">{activeCyclesCount}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-muted-foreground">{t("rail.noSelection")}</p>
        </div>
      )}

      <div className="mt-auto border-t border-border">
        <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1.5">
          <span className="font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
            {t("rail.syncQueue")}
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto px-3.5 pb-3">
          <SyncIssuesList orgSlug={orgSlug} />
          <div className="mt-2 flex flex-col gap-2">
            {SYNC_KINDS.map((kind) => (
              <PendingEntries key={kind} orgSlug={orgSlug} kind={kind} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
