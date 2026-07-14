"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Metric } from "@/components/ui/metric";
import { cn } from "@/lib/utils";
import { computeActivityTotals } from "@/lib/calc/costs";
import { enqueue, flushOutbox, outboxCounts } from "@/lib/offline/outbox";
import { useOnlineStatus } from "@/components/offline/sync-status-badge";
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
  workerId: string;
  workerName: string;
  workersCount: string;
  hours: string;
  quantity: string;
  rateType: "daily" | "hourly" | "piecework";
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
  readonly workers: Option[];
  /** productId -> default-warehouse WAC (src/lib/calc/activity-costing.ts),
   * used to prefill (still editable) each input line's unit cost. */
  readonly unitCostByProduct: Record<string, string>;
  readonly currencyCode: string;
  readonly currencies: string[];
};

let keyCounter = 1;

// Density-driven building blocks shared by every field on this form — office
// mode gets the compact 28/24px sizing, field mode gets 56/48px glove
// targets, from the exact same className strings (see globals.css
// [data-mode="field"]).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
// Border-less variant for fields that live inside an already-bordered table
// row (Insumos / Mano de obra lines) — avoids doubled/conflicting borders.
const ROW_FIELD =
  "h-[var(--density-control-h)] rounded-[3px] bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CELL =
  "px-[var(--density-cell-px)] py-[var(--density-cell-py)] min-h-[var(--density-row-h)]";

function chipClass(selected: boolean, extra?: string) {
  return cn(
    "flex items-center rounded-[3px] border text-left text-[length:var(--density-font-body)] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-2 border-foreground bg-foreground font-semibold text-background"
      : "border-border font-medium text-foreground hover:bg-muted",
    extra,
  );
}

export function ActivityForm({
  locale,
  orgSlug,
  parcels,
  cycles,
  activityTypes,
  products,
  costCenters,
  workers,
  unitCostByProduct,
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
  const online = useOnlineStatus();
  const counts = useLiveQuery(
    () => outboxCounts(orgSlug),
    [orgSlug],
    { pending: 0, rejected: 0 },
  );

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
          quantity: line.quantity || 0,
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
        workerId: line.workerId || undefined,
        workerName: line.workerName || undefined,
        workersCount: Number(line.workersCount) || 1,
        hours: line.hours || undefined,
        quantity:
          line.rateType === "piecework" ? line.quantity || "0" : undefined,
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

  const selectClass = cn(CONTROL, "w-full");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {!online && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-[3px] border border-sync-pending-border bg-sync-pending-bg",
            CELL,
          )}
        >
          <span
            className="size-2 shrink-0 rounded-full bg-sync-pending-fg"
            aria-hidden
          />
          <span className="font-mono text-[length:var(--density-font-body)] font-semibold text-sync-pending-fg">
            {tOffline("badge.offline", { count: counts.pending })}
          </span>
        </div>
      )}

      {/* Parcel picker — board 1f chip grid. Same setParcelId state the
          previous <select> drove; only the control surface changed. */}
      <div className="flex flex-col gap-2">
        <span className={MICRO_LABEL}>{t("parcel")}</span>
        <div
          role="group"
          aria-label={t("parcel")}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          <button
            type="button"
            aria-pressed={parcelId === ""}
            onClick={() => {
              setParcelId("");
              setCropCycleId("");
            }}
            className={chipClass(parcelId === "", "min-h-[var(--density-row-h)] px-[var(--density-cell-px)]")}
          >
            {t("parcelNone")}
          </button>
          {parcels.map((parcel) => (
            <button
              key={parcel.id}
              type="button"
              aria-pressed={parcelId === parcel.id}
              onClick={() => {
                setParcelId(parcel.id);
                setCropCycleId("");
              }}
              className={chipClass(
                parcelId === parcel.id,
                "min-h-[var(--density-row-h)] px-[var(--density-cell-px)]",
              )}
            >
              {parcel.name}
            </button>
          ))}
        </div>
      </div>

      {/* Activity-type picker — board 1f chip wrap. */}
      <div className="flex flex-col gap-2">
        <span className={MICRO_LABEL}>{t("type")}</span>
        <div
          role="group"
          aria-label={t("type")}
          className="flex flex-wrap gap-2"
        >
          {activityTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={activityTypeId === type.id}
              onClick={() => setActivityTypeId(type.id)}
              className={chipClass(
                activityTypeId === type.id,
                "h-[var(--density-control-h)] px-[var(--density-cell-px)]",
              )}
            >
              {type.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="date" className={MICRO_LABEL}>
            {t("date")}
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={cn(CONTROL, "w-full")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cropCycleId" className={MICRO_LABEL}>
            {t("cycle")}
          </Label>
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
            <Label htmlFor="costCenterId" className={MICRO_LABEL}>
              {t("costCenter")}
            </Label>
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
          <Label htmlFor="description" className={MICRO_LABEL}>
            {t("description")}
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={cn(CONTROL, "w-full")}
          />
        </div>
      </div>

      {/* Insumos — bordered rows with mono numerals, board 1f treatment. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className={MICRO_LABEL}>{t("inputs.title")}</span>
          <span className="font-mono tabular text-[length:var(--density-font-label)] text-muted-foreground">
            {t("totals.inputs")} {fmt(totals.inputCost)}
          </span>
        </div>
        {inputs.length > 0 && (
          <div className="flex flex-col rounded-[3px] border border-border">
            {inputs.map((line, index) => (
              <div
                key={line.key}
                className={cn(
                  "grid grid-cols-[1fr_5.5rem_6.5rem_auto] items-center gap-2 border-b border-border last:border-b-0",
                  CELL,
                )}
              >
                <select
                  aria-label={t("inputs.product")}
                  value={line.productId}
                  onChange={(e) => {
                    const productId = e.target.value;
                    setInputs((lines) =>
                      lines.map((l, i) =>
                        i === index
                          ? {
                              ...l,
                              productId,
                              // Prefill from WAC; user can still edit it.
                              unitCost: unitCostByProduct[productId] ?? l.unitCost,
                            }
                          : l,
                      ),
                    );
                  }}
                  className={cn(
                    ROW_FIELD,
                    "w-full border-r border-border pr-2",
                  )}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t("inputs.quantity")}
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
                  className={cn(
                    ROW_FIELD,
                    "w-full text-right font-mono tabular",
                  )}
                />
                <input
                  aria-label={t("inputs.unitCost")}
                  title={
                    unitCostByProduct[line.productId]
                      ? t("inputs.unitCostHint")
                      : undefined
                  }
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
                  className={cn(
                    ROW_FIELD,
                    "w-full text-right font-mono tabular",
                  )}
                />
                <button
                  type="button"
                  onClick={() =>
                    setInputs((lines) => lines.filter((_, i) => i !== index))
                  }
                  className="font-mono text-[length:var(--density-font-label)] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t("inputs.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() =>
            setInputs((lines) => {
              const productId = products[0]?.id ?? "";
              return [
                ...lines,
                {
                  key: keyCounter++,
                  productId,
                  quantity: "",
                  unitCost: unitCostByProduct[productId] ?? "",
                },
              ];
            })
          }
          className="flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-dashed border-border text-[length:var(--density-font-body)] text-muted-foreground hover:bg-muted"
        >
          {t("inputs.add")}
        </button>
      </div>

      {/* Mano de obra — same bordered-row treatment. */}
      <div className="flex flex-col gap-2">
        <span className={MICRO_LABEL}>{t("labor.title")}</span>
        {labor.length > 0 && (
          <div className="flex flex-col rounded-[3px] border border-border">
            {labor.map((line, index) => (
              <div
                key={line.key}
                className={cn(
                  "flex flex-wrap items-center gap-2 border-b border-border last:border-b-0",
                  CELL,
                )}
              >
                <select
                  aria-label={t("labor.worker")}
                  value={line.workerId}
                  onChange={(e) =>
                    setLabor((lines) =>
                      lines.map((l, i) =>
                        i === index ? { ...l, workerId: e.target.value } : l,
                      ),
                    )
                  }
                  className={cn(CONTROL, "w-40")}
                >
                  <option value="">{t("labor.workerNone")}</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t("labor.workerName")}
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
                  className={cn(CONTROL, "w-40 flex-1")}
                  placeholder={t("labor.workerName")}
                />
                <input
                  aria-label={t("labor.workersCount")}
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
                  className={cn(CONTROL, "w-16 text-right font-mono tabular")}
                />
                <select
                  aria-label={t("labor.rateType")}
                  value={line.rateType}
                  onChange={(e) =>
                    setLabor((lines) =>
                      lines.map((l, i) =>
                        i === index
                          ? {
                              ...l,
                              rateType: e.target.value as
                                | "daily"
                                | "hourly"
                                | "piecework",
                            }
                          : l,
                      ),
                    )
                  }
                  className={CONTROL}
                >
                  <option value="daily">{t("labor.daily")}</option>
                  <option value="hourly">{t("labor.hourly")}</option>
                  <option value="piecework">{t("labor.piecework")}</option>
                </select>
                {line.rateType === "hourly" && (
                  <input
                    aria-label={t("labor.hours")}
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
                    className={cn(
                      CONTROL,
                      "w-20 text-right font-mono tabular",
                    )}
                  />
                )}
                {line.rateType === "piecework" && (
                  <input
                    aria-label={t("labor.quantity")}
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.quantity}
                    onChange={(e) =>
                      setLabor((lines) =>
                        lines.map((l, i) =>
                          i === index
                            ? { ...l, quantity: e.target.value }
                            : l,
                        ),
                      )
                    }
                    className={cn(
                      CONTROL,
                      "w-20 text-right font-mono tabular",
                    )}
                  />
                )}
                <input
                  aria-label={t("labor.rate")}
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
                  className={cn(CONTROL, "w-24 text-right font-mono tabular")}
                />
                <span className="ml-auto font-mono tabular text-[length:var(--density-font-body)]">
                  {fmt(totals.laborAmounts[index] ?? "0")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setLabor((lines) => lines.filter((_, i) => i !== index))
                  }
                  className="font-mono text-[length:var(--density-font-label)] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t("labor.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() =>
            setLabor((lines) => [
              ...lines,
              {
                key: keyCounter++,
                workerId: "",
                workerName: "",
                workersCount: "1",
                hours: "",
                quantity: "",
                rateType: "daily",
                rate: "",
              },
            ])
          }
          className="flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-dashed border-border text-[length:var(--density-font-body)] text-muted-foreground hover:bg-muted"
        >
          {t("labor.add")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="otherCost" className={MICRO_LABEL}>
            {t("otherCost")}
          </Label>
          <Input
            id="otherCost"
            type="number"
            step="0.01"
            min="0"
            value={otherCost}
            onChange={(e) => setOtherCost(e.target.value)}
            className={cn(CONTROL, "w-32 text-right font-mono tabular")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currency" className={MICRO_LABEL}>
            {t("currency")}
          </Label>
          <select
            id="currency"
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className={CONTROL}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
                {code === currencyCode ? " *" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="font-mono tabular text-[length:var(--density-font-label)] text-muted-foreground">
            {t("totals.inputs")}: {fmt(totals.inputCost)} · {t("totals.labor")}
            : {fmt(totals.laborCost)} · {t("totals.other")}:{" "}
            {fmt(totals.otherCost)}
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className={MICRO_LABEL}>{t("totals.total")}</span>
            <Metric
              value={fmt(totals.totalCost)}
              className="text-[length:calc(var(--density-font-body)*1.4)] font-semibold"
            />
          </span>
        </div>
      </div>

      {saveError && <Notice variant="error">{tOffline("saveError")}</Notice>}

      <button
        type="submit"
        disabled={submitting}
        className="h-[var(--density-control-h)] w-full rounded-[3px] bg-foreground px-6 text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {t("save")}
      </button>
    </form>
  );
}
