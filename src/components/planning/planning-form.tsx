"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlannedActivityAction } from "@/server/actions/planning";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type CycleOption = Option & { parcelId: string };

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly year: number;
  readonly month: number;
  readonly activityTypes: Option[];
  readonly parcels: Option[];
  readonly cycles: CycleOption[];
};

// Same density building blocks as the payroll/work-orders "new" sections —
// this form lives inside a page that already opts into the density system.
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] w-full rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";

/** Today when it falls in the viewed month, else the 1st of that month. */
function defaultPlannedDate(year: number, month: number): string {
  const today = new Date();
  if (today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month) {
    return today.toISOString().slice(0, 10);
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function PlanningForm({
  locale,
  orgSlug,
  year,
  month,
  activityTypes,
  parcels,
  cycles,
}: Props) {
  const t = useTranslations("planning");
  const [parcelId, setParcelId] = useState("");

  const parcelCycles = cycles.filter(
    (c) => !parcelId || c.parcelId === parcelId,
  );

  return (
    <section className="flex flex-col rounded-[3px] border border-border">
      <div className={cn(CELL, "border-b border-border")}>
        <h2 className={MICRO_LABEL}>{t("new")}</h2>
      </div>
      <form
        action={createPlannedActivityAction}
        className="grid gap-4 p-4 sm:grid-cols-2"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="activityTypeId" className={MICRO_LABEL}>
            {t("activityType")}
          </Label>
          <select
            id="activityTypeId"
            name="activityTypeId"
            defaultValue={activityTypes[0]?.id ?? ""}
            required
            className={CONTROL}
          >
            {activityTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plannedDate" className={MICRO_LABEL}>
            {t("plannedDate")}
          </Label>
          <Input
            id="plannedDate"
            name="plannedDate"
            type="date"
            defaultValue={defaultPlannedDate(year, month)}
            required
            className={cn(CONTROL, "tabular font-mono")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="parcelId" className={MICRO_LABEL}>
            {t("parcel")}
          </Label>
          <select
            id="parcelId"
            name="parcelId"
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
            className={CONTROL}
          >
            <option value="">{t("parcelNone")}</option>
            {parcels.map((parcel) => (
              <option key={parcel.id} value={parcel.id}>
                {parcel.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cropCycleId" className={MICRO_LABEL}>
            {t("cycle")}
          </Label>
          <select
            key={parcelId}
            id="cropCycleId"
            name="cropCycleId"
            defaultValue=""
            className={CONTROL}
          >
            <option value="">{t("cycleNone")}</option>
            {parcelCycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="description" className={MICRO_LABEL}>
            {t("description")}
          </Label>
          <Input
            id="description"
            name="description"
            className={CONTROL}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="estimatedCost" className={MICRO_LABEL}>
            {t("estimatedCost")}
          </Label>
          <Input
            id="estimatedCost"
            name="estimatedCost"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className={cn(CONTROL, "tabular text-right font-mono")}
          />
        </div>
        <button
          type="submit"
          className="h-[var(--density-control-h)] self-end justify-self-start rounded-[3px] bg-foreground px-6 text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90"
        >
          {t("create")}
        </button>
      </form>
    </section>
  );
}
