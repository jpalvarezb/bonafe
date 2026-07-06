"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createMachineAction,
  updateMachineAction,
} from "@/server/actions/machinery";

type MachineValues = {
  id?: string;
  name?: string;
  code?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  hourlyCost?: string | null;
  notes?: string | null;
};

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly machine?: MachineValues;
};

export function MachineForm({ locale, orgSlug, machine }: Props) {
  const t = useTranslations("machinery");
  const isEdit = Boolean(machine?.id);
  const action = isEdit ? updateMachineAction : createMachineAction;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {isEdit && <input type="hidden" name="machineId" value={machine!.id} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("form.name")}</Label>
        <Input id="name" name="name" required defaultValue={machine?.name ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t("form.code")}</Label>
        <Input id="code" name="code" defaultValue={machine?.code ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="category">{t("form.category")}</Label>
        <Input
          id="category"
          name="category"
          placeholder={t("form.categoryPlaceholder")}
          defaultValue={machine?.category ?? ""}
        />
      </div>
      <div />
      <div className="flex flex-col gap-2">
        <Label htmlFor="brand">{t("form.brand")}</Label>
        <Input id="brand" name="brand" defaultValue={machine?.brand ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="model">{t("form.model")}</Label>
        <Input id="model" name="model" defaultValue={machine?.model ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="year">{t("form.year")}</Label>
        <Input
          id="year"
          name="year"
          type="number"
          min="1900"
          max="2100"
          step="1"
          defaultValue={machine?.year ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="hourlyCost">{t("form.hourlyCost")}</Label>
        <Input
          id="hourlyCost"
          name="hourlyCost"
          inputMode="decimal"
          pattern="^\d{1,12}(\.\d{1,8})?$"
          placeholder="0.00"
          defaultValue={machine?.hourlyCost ?? ""}
        />
        <p className="text-xs text-muted-foreground">{t("form.rateHint")}</p>
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="notes">{t("form.notes")}</Label>
        <Input id="notes" name="notes" defaultValue={machine?.notes ?? ""} />
      </div>

      <Button type="submit" className="self-start">
        {isEdit ? t("form.save") : t("form.create")}
      </Button>
    </form>
  );
}
