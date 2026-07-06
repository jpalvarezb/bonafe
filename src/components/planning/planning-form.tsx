"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createPlannedActivityAction } from "@/server/actions/planning";

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

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

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
    <Card>
      <CardHeader>
        <CardTitle>{t("new")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={createPlannedActivityAction}
          className="grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="activityTypeId">{t("activityType")}</Label>
            <select
              id="activityTypeId"
              name="activityTypeId"
              defaultValue={activityTypes[0]?.id ?? ""}
              required
              className={selectClass}
            >
              {activityTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plannedDate">{t("plannedDate")}</Label>
            <Input
              id="plannedDate"
              name="plannedDate"
              type="date"
              defaultValue={defaultPlannedDate(year, month)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="parcelId">{t("parcel")}</Label>
            <select
              id="parcelId"
              name="parcelId"
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              className={selectClass}
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
            <Label htmlFor="cropCycleId">{t("cycle")}</Label>
            <select
              key={parcelId}
              id="cropCycleId"
              name="cropCycleId"
              defaultValue=""
              className={selectClass}
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
            <Label htmlFor="description">{t("description")}</Label>
            <Input id="description" name="description" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="estimatedCost">{t("estimatedCost")}</Label>
            <Input
              id="estimatedCost"
              name="estimatedCost"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>
          <Button type="submit" className="self-end justify-self-start">
            {t("create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
