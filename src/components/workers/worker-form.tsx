"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkerAction, updateWorkerAction } from "@/server/actions/workers";

type WorkerValues = {
  id?: string;
  name?: string;
  code?: string | null;
  documentId?: string | null;
  phone?: string | null;
  type?: "fixed" | "temporary";
  dailyRate?: string | null;
  hourlyRate?: string | null;
  notes?: string | null;
};

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly worker?: WorkerValues;
};

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

export function WorkerForm({ locale, orgSlug, worker }: Props) {
  const t = useTranslations("workers");
  const isEdit = Boolean(worker?.id);
  const action = isEdit ? updateWorkerAction : createWorkerAction;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {isEdit && <input type="hidden" name="workerId" value={worker!.id} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("form.name")}</Label>
        <Input id="name" name="name" required defaultValue={worker?.name ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t("form.code")}</Label>
        <Input id="code" name="code" defaultValue={worker?.code ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="documentId">{t("form.documentId")}</Label>
        <Input
          id="documentId"
          name="documentId"
          defaultValue={worker?.documentId ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">{t("form.phone")}</Label>
        <Input id="phone" name="phone" defaultValue={worker?.phone ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="type">{t("form.type")}</Label>
        <select
          id="type"
          name="type"
          required
          defaultValue={worker?.type ?? "temporary"}
          className={selectClass}
        >
          <option value="fixed">{t("types.fixed")}</option>
          <option value="temporary">{t("types.temporary")}</option>
        </select>
      </div>
      <div />
      <div className="flex flex-col gap-2">
        <Label htmlFor="dailyRate">{t("form.dailyRate")}</Label>
        <Input
          id="dailyRate"
          name="dailyRate"
          inputMode="decimal"
          pattern="^\d{1,10}(\.\d{1,4})?$"
          placeholder="0.00"
          defaultValue={worker?.dailyRate ?? ""}
        />
        <p className="text-xs text-muted-foreground">{t("form.rateHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="hourlyRate">{t("form.hourlyRate")}</Label>
        <Input
          id="hourlyRate"
          name="hourlyRate"
          inputMode="decimal"
          pattern="^\d{1,10}(\.\d{1,4})?$"
          placeholder="0.00"
          defaultValue={worker?.hourlyRate ?? ""}
        />
        <p className="text-xs text-muted-foreground">{t("form.rateHint")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="notes">{t("form.notes")}</Label>
        <Input id="notes" name="notes" defaultValue={worker?.notes ?? ""} />
      </div>

      <Button type="submit" className="self-start">
        {isEdit ? t("form.save") : t("form.create")}
      </Button>
    </form>
  );
}
