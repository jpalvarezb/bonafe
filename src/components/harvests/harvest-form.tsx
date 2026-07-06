"use client";

import { useState } from "react";
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
import { enqueue, flushOutbox } from "@/lib/offline/outbox";
import { newId } from "@/lib/ids";

type Option = { id: string; name: string };
type CycleOption = Option & { parcelId: string };

type Unit = "kg" | "lb" | "qq" | "lata" | "saco";

type Props = {
  readonly orgSlug: string;
  readonly parcels: Option[];
  readonly cycles: CycleOption[];
  readonly workers: Option[];
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HarvestForm({ orgSlug, parcels, cycles, workers }: Props) {
  const t = useTranslations("harvests");
  const tOffline = useTranslations("offline");
  const router = useRouter();
  const [parcelId, setParcelId] = useState<string>(parcels[0]?.id ?? "");
  const [cropCycleId, setCropCycleId] = useState<string>("");
  const [workerId, setWorkerId] = useState<string>("");
  const [date, setDate] = useState(today());
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [qualityGrade, setQualityGrade] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const parcelCycles = cycles.filter(
    (c) => !parcelId || c.parcelId === parcelId,
  );

  function resetForm() {
    setCropCycleId("");
    setWorkerId("");
    setDate(today());
    setQuantity("");
    setUnit("kg");
    setQualityGrade("");
    setNotes("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSaveError(false);
    try {
      const payload = {
        id: newId(),
        parcelId,
        cropCycleId: cropCycleId || undefined,
        workerId: workerId || undefined,
        date,
        quantity,
        unit,
        qualityGrade: qualityGrade || undefined,
        notes: notes || undefined,
      };
      await enqueue(orgSlug, "harvest.create", payload);
      if (navigator.onLine) {
        await flushOutbox(orgSlug).catch(() => null);
        router.refresh();
      }
      // Offline: skip refresh — navigation would fail without a network, and
      // the PendingEntries live query already shows the queued record.
      resetForm();
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
    <Card>
      <CardHeader>
        <CardTitle>{t("new")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="parcelId">{t("parcel")}</Label>
            <select
              id="parcelId"
              value={parcelId}
              onChange={(e) => {
                setParcelId(e.target.value);
                setCropCycleId("");
              }}
              required
              className={selectClass}
            >
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="workerId">{t("worker")}</Label>
            <select
              id="workerId"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("workerNone")}</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
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
            <Label htmlFor="quantity">{t("quantity")}</Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="unit">{t("unit")}</Label>
            <select
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              required
              className={selectClass}
            >
              <option value="kg">{t("units.kg")}</option>
              <option value="lb">{t("units.lb")}</option>
              <option value="qq">{t("units.qq")}</option>
              <option value="lata">{t("units.lata")}</option>
              <option value="saco">{t("units.saco")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="qualityGrade">{t("qualityGrade")}</Label>
            <Input
              id="qualityGrade"
              value={qualityGrade}
              onChange={(e) => setQualityGrade(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {saveError && (
            <p className="text-sm text-destructive sm:col-span-2">
              {tOffline("saveError")}
            </p>
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="self-end justify-self-start"
          >
            {t("create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
