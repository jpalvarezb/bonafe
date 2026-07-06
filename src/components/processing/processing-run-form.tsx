"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createRunAction } from "@/server/actions/processing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Same free-unit set offered by the harvest capture form. */
const KNOWN_UNITS = ["kg", "lb", "qq", "lata", "saco"];

type CycleOption = { id: string; name: string };
type LotOption = { id: string; name: string; cropCycleId: string };

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly cycles: CycleOption[];
  readonly lots: LotOption[];
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

export function ProcessingRunForm({ locale, orgSlug, cycles, lots }: Props) {
  const t = useTranslations("processing");
  const [cropCycleId, setCropCycleId] = useState<string>(cycles[0]?.id ?? "");

  const cycleLots = lots.filter((lot) => lot.cropCycleId === cropCycleId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("runs.new")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createRunAction} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="cropCycleId">{t("runs.cycle")}</Label>
            <select
              id="cropCycleId"
              name="cropCycleId"
              value={cropCycleId}
              onChange={(e) => setCropCycleId(e.target.value)}
              required
              className={selectClass}
            >
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="harvestLotId">{t("runs.lot")}</Label>
            <select
              id="harvestLotId"
              name="harvestLotId"
              defaultValue=""
              className={selectClass}
            >
              <option value="">{t("runs.lotNone")}</option>
              {cycleLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">{t("runs.date")}</Label>
            <Input id="date" name="date" type="date" defaultValue={today()} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inputQuantity">{t("runs.inputQuantity")}</Label>
            <Input
              id="inputQuantity"
              name="inputQuantity"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inputUnit">{t("runs.inputUnit")}</Label>
            <select
              id="inputUnit"
              name="inputUnit"
              defaultValue="kg"
              required
              className={selectClass}
            >
              {KNOWN_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`units.${unit}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="outputQuantity">{t("runs.outputQuantity")}</Label>
            <Input
              id="outputQuantity"
              name="outputQuantity"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="outputUnit">{t("runs.outputUnit")}</Label>
            <select
              id="outputUnit"
              name="outputUnit"
              defaultValue="kg"
              required
              className={selectClass}
            >
              {KNOWN_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`units.${unit}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cost">{t("runs.cost")}</Label>
            <Input
              id="cost"
              name="cost"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="notes">{t("runs.notes")}</Label>
            <Input id="notes" name="notes" />
          </div>
          <Button type="submit" className="self-end justify-self-start">
            {t("runs.create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
