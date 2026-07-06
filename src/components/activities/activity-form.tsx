"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { computeActivityTotals } from "@/lib/calc/costs";
import { enqueue, flushOutbox } from "@/lib/offline/outbox";
import { newId } from "@/lib/ids";

type Option = { id: string; name: string };
type CycleOption = Option & { parcelId: string };

type InputLineState = {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
};

type LaborLineState = {
  key: number;
  workerName: string;
  workersCount: string;
  hours: string;
  rateType: "daily" | "hourly";
  rate: string;
};

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly parcels: Option[];
  readonly cycles: CycleOption[];
  readonly activityTypes: Option[];
  readonly products: Option[];
  readonly costCenters: Option[];
  readonly currencyCode: string;
  readonly currencies: string[];
};

let keyCounter = 1;

export function ActivityForm({
  locale,
  orgSlug,
  parcels,
  cycles,
  activityTypes,
  products,
  costCenters,
  currencyCode,
  currencies,
}: Props) {
  const t = useTranslations("activities");
  const router = useRouter();
  const [parcelId, setParcelId] = useState<string>("");
  const [cropCycleId, setCropCycleId] = useState<string>("");
  const [activityTypeId, setActivityTypeId] = useState<string>(
    activityTypes[0]?.id ?? "",
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [otherCost, setOtherCost] = useState("");
  const [costCenterId, setCostCenterId] = useState<string>("");
  const [selectedCurrency, setSelectedCurrency] = useState(currencyCode);
  const [inputs, setInputs] = useState<InputLineState[]>([]);
  const [labor, setLabor] = useState<LaborLineState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const tOffline = useTranslations("offline");

  const parcelCycles = cycles.filter(
    (c) => !parcelId || c.parcelId === parcelId,
  );

  const totals = useMemo(
    () =>
      computeActivityTotals({
        inputs: inputs.map((line) => ({
          quantity: line.quantity || 0,
          unitCost: line.unitCost || 0,
        })),
        labor: labor.map((line) => ({
          workersCount: Number(line.workersCount) || 0,
          hours: line.hours || 0,
          rateType: line.rateType,
          rate: line.rate || 0,
        })),
        otherCost: otherCost || 0,
      }),
    [inputs, labor, otherCost],
  );

  const fmt = (value: string) =>
    `${Number(value).toLocaleString(locale, { maximumFractionDigits: 2 })} ${selectedCurrency}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSaveError(false);
    const payload = {
      id: newId(),
      parcelId: parcelId || undefined,
      cropCycleId: cropCycleId || undefined,
      costCenterId: costCenterId || undefined,
      activityTypeId,
      date,
      description: description || undefined,
      otherCost: otherCost || undefined,
      currencyCode: selectedCurrency,
      inputs: inputs
        .filter((line) => line.productId)
        .map((line) => ({
          productId: line.productId,
          quantity: line.quantity || "0",
          unitCost: line.unitCost || "0",
        })),
      labor: labor.map((line) => ({
        workerName: line.workerName || undefined,
        workersCount: Number(line.workersCount) || 1,
        hours: line.hours || undefined,
        rateType: line.rateType,
        rate: line.rate || "0",
      })),
    };
    try {
      await enqueue(orgSlug, "activity.create", payload);
      if (navigator.onLine) {
        flushOutbox(orgSlug).catch(() => null);
        router.push(`/o/${orgSlug}/activities`);
        return;
      }
      // Offline: navigation would fail without a network — stay on the form,
      // reset it for the next capture; the outbox syncs when back online.
      setDescription("");
      setOtherCost("");
      setInputs([]);
      setLabor([]);
    } catch {
      // enqueue() zod-rejects invalid payloads before anything is stored.
      setSaveError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="activityTypeId">{t("type")}</Label>
          <select
            id="activityTypeId"
            value={activityTypeId}
            onChange={(e) => setActivityTypeId(e.target.value)}
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
          <Label htmlFor="date">{t("date")}</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="parcelId">{t("parcel")}</Label>
          <select
            id="parcelId"
            value={parcelId}
            onChange={(e) => {
              setParcelId(e.target.value);
              setCropCycleId("");
            }}
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
            id="cropCycleId"
            value={cropCycleId}
            onChange={(e) => setCropCycleId(e.target.value)}
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
        {costCenters.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="costCenterId">{t("costCenter")}</Label>
            <select
              id="costCenterId"
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("costCenterNone")}</option>
              {costCenters.map((costCenter) => (
                <option key={costCenter.id} value={costCenter.id}>
                  {costCenter.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="description">{t("description")}</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("inputs.title")}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setInputs((lines) => [
                ...lines,
                {
                  key: keyCounter++,
                  productId: products[0]?.id ?? "",
                  quantity: "",
                  unitCost: "",
                },
              ])
            }
          >
            {t("inputs.add")}
          </Button>
        </CardHeader>
        {inputs.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {inputs.map((line, index) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("inputs.product")}</Label>
                  <select
                    value={line.productId}
                    onChange={(e) =>
                      setInputs((lines) =>
                        lines.map((l, i) =>
                          i === index ? { ...l, productId: e.target.value } : l,
                        ),
                      )
                    }
                    className={`${selectClass} w-48`}
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("inputs.quantity")}</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.quantity}
                    onChange={(e) =>
                      setInputs((lines) =>
                        lines.map((l, i) =>
                          i === index ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                    className="w-28"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("inputs.unitCost")}</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.unitCost}
                    onChange={(e) =>
                      setInputs((lines) =>
                        lines.map((l, i) =>
                          i === index ? { ...l, unitCost: e.target.value } : l,
                        ),
                      )
                    }
                    className="w-28"
                  />
                </div>
                <span className="pb-2 text-sm text-muted-foreground">
                  = {fmt(totals.inputTotals[index] ?? "0")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setInputs((lines) => lines.filter((_, i) => i !== index))
                  }
                >
                  {t("inputs.remove")}
                </Button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("labor.title")}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLabor((lines) => [
                ...lines,
                {
                  key: keyCounter++,
                  workerName: "",
                  workersCount: "1",
                  hours: "",
                  rateType: "daily",
                  rate: "",
                },
              ])
            }
          >
            {t("labor.add")}
          </Button>
        </CardHeader>
        {labor.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {labor.map((line, index) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("labor.workerName")}</Label>
                  <Input
                    value={line.workerName}
                    onChange={(e) =>
                      setLabor((lines) =>
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, workerName: e.target.value }
                            : l,
                        ),
                      )
                    }
                    className="w-44"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("labor.workersCount")}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={line.workersCount}
                    onChange={(e) =>
                      setLabor((lines) =>
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, workersCount: e.target.value }
                            : l,
                        ),
                      )
                    }
                    className="w-20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("labor.rateType")}</Label>
                  <select
                    value={line.rateType}
                    onChange={(e) =>
                      setLabor((lines) =>
                        lines.map((l, i) =>
                          i === index
                            ? {
                                ...l,
                                rateType: e.target.value as "daily" | "hourly",
                              }
                            : l,
                        ),
                      )
                    }
                    className={selectClass}
                  >
                    <option value="daily">{t("labor.daily")}</option>
                    <option value="hourly">{t("labor.hourly")}</option>
                  </select>
                </div>
                {line.rateType === "hourly" && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">{t("labor.hours")}</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={line.hours}
                      onChange={(e) =>
                        setLabor((lines) =>
                          lines.map((l, i) =>
                            i === index ? { ...l, hours: e.target.value } : l,
                          ),
                        )
                      }
                      className="w-24"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("labor.rate")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.rate}
                    onChange={(e) =>
                      setLabor((lines) =>
                        lines.map((l, i) =>
                          i === index ? { ...l, rate: e.target.value } : l,
                        ),
                      )
                    }
                    className="w-28"
                  />
                </div>
                <span className="pb-2 text-sm text-muted-foreground">
                  = {fmt(totals.laborAmounts[index] ?? "0")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLabor((lines) => lines.filter((_, i) => i !== index))
                  }
                >
                  {t("labor.remove")}
                </Button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="otherCost">{t("otherCost")}</Label>
          <Input
            id="otherCost"
            type="number"
            step="0.01"
            min="0"
            value={otherCost}
            onChange={(e) => setOtherCost(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currency">{t("currency")}</Label>
          <select
            id="currency"
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className={selectClass}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
                {code === currencyCode ? " *" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-col items-end text-sm">
          <span className="text-muted-foreground">
            {t("totals.inputs")}: {fmt(totals.inputCost)} · {t("totals.labor")}
            : {fmt(totals.laborCost)} · {t("totals.other")}:{" "}
            {fmt(totals.otherCost)}
          </span>
          <span className="text-lg font-semibold">
            {t("totals.total")}: {fmt(totals.totalCost)}
          </span>
        </div>
      </div>

      {saveError && (
        <p className="text-sm text-destructive">{tOffline("saveError")}</p>
      )}
      <Button type="submit" disabled={submitting} className="self-start">
        {t("save")}
      </Button>
    </form>
  );
}
