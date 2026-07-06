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

type MonitoringType = "pest" | "disease" | "weed";

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly parcels: Option[];
  readonly cycles: CycleOption[];
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MonitoringForm({ orgSlug, parcels, cycles }: Props) {
  const t = useTranslations("monitoring");
  const router = useRouter();
  const [parcelId, setParcelId] = useState<string>(parcels[0]?.id ?? "");
  const [cropCycleId, setCropCycleId] = useState<string>("");
  const [date, setDate] = useState(today());
  const [type, setType] = useState<MonitoringType>("pest");
  const [agentName, setAgentName] = useState("");
  const [severity, setSeverity] = useState("1");
  const [incidencePct, setIncidencePct] = useState("");
  const [notes, setNotes] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const tOffline = useTranslations("offline");

  const parcelCycles = cycles.filter(
    (c) => !parcelId || c.parcelId === parcelId,
  );

  function resetForm() {
    setCropCycleId("");
    setDate(today());
    setType("pest");
    setAgentName("");
    setSeverity("1");
    setIncidencePct("");
    setNotes("");
    setActionsTaken("");
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
        date,
        type,
        agentName,
        severity: Number(severity),
        incidencePct: incidencePct || undefined,
        notes: notes || undefined,
        actionsTaken: actionsTaken || undefined,
      };
      await enqueue(orgSlug, "monitoring.create", payload);
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
            <Label htmlFor="type">{t("type")}</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as MonitoringType)}
              required
              className={selectClass}
            >
              <option value="pest">{t("types.pest")}</option>
              <option value="disease">{t("types.disease")}</option>
              <option value="weed">{t("types.weed")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agentName">{t("agentName")}</Label>
            <Input
              id="agentName"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              required
              placeholder={t("agentNamePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="severity">{t("severity")}</Label>
            <select
              id="severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              required
              className={selectClass}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="incidencePct">{t("incidencePct")}</Label>
            <Input
              id="incidencePct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={incidencePct}
              onChange={(e) => setIncidencePct(e.target.value)}
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="actionsTaken">{t("actionsTaken")}</Label>
            <Input
              id="actionsTaken"
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.target.value)}
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
