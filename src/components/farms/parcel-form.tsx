"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParcelDrawMap } from "@/components/map/parcel-draw-map";
import type { GeoJsonPolygon } from "@/lib/db/geometry";
import {
  createParcelAction,
  updateParcelAction,
} from "@/server/actions/farms";

type ParcelValues = {
  id?: string;
  name?: string;
  code?: string | null;
  soilType?: string | null;
  areaHa?: string | null;
  boundary?: GeoJsonPolygon | null;
  attributes?: Record<string, string> | null;
};

type AttributeRow = { key: string; value: string };

function toRows(attributes: Record<string, string> | null | undefined): AttributeRow[] {
  return Object.entries(attributes ?? {}).map(([key, value]) => ({ key, value }));
}

function toAttributesJson(rows: AttributeRow[]): string {
  const attrs: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) attrs[key] = row.value;
  }
  return JSON.stringify(attrs);
}

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly farmId: string;
  readonly parcel?: ParcelValues;
};

export function ParcelForm({ locale, orgSlug, farmId, parcel }: Props) {
  const t = useTranslations("farms.parcels");
  const [boundary, setBoundary] = useState<GeoJsonPolygon | null>(
    parcel?.boundary ?? null,
  );
  const [attributeRows, setAttributeRows] = useState<AttributeRow[]>(() => {
    const rows = toRows(parcel?.attributes);
    return rows.length > 0 ? rows : [{ key: "", value: "" }];
  });
  const isEdit = Boolean(parcel?.id);
  const action = isEdit ? updateParcelAction : createParcelAction;

  function updateRow(index: number, patch: Partial<AttributeRow>) {
    setAttributeRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setAttributeRows((rows) => [...rows, { key: "", value: "" }]);
  }

  function removeRow(index: number) {
    setAttributeRows((rows) => rows.filter((_, i) => i !== index));
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="farmId" value={farmId} />
      {isEdit && <input type="hidden" name="parcelId" value={parcel!.id} />}
      <input
        type="hidden"
        name="boundary"
        value={boundary ? JSON.stringify(boundary) : ""}
      />
      <input
        type="hidden"
        name="attributes"
        value={toAttributesJson(attributeRows)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={parcel?.name ?? ""}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{t("code")}</Label>
          <Input id="code" name="code" defaultValue={parcel?.code ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="soilType">{t("soilType")}</Label>
          <Input
            id="soilType"
            name="soilType"
            defaultValue={parcel?.soilType ?? ""}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="areaHa">{t("areaHa")}</Label>
          <Input
            id="areaHa"
            name="areaHa"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={parcel?.areaHa ?? ""}
            placeholder={t("areaAuto")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("boundary")}</Label>
        <ParcelDrawMap
          initialBoundary={parcel?.boundary ?? null}
          onBoundaryChange={setBoundary}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("attributes.title")}</Label>
        <div className="flex flex-col gap-2">
          {attributeRows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder={t("attributes.key")}
                value={row.key}
                maxLength={40}
                onChange={(e) => updateRow(index, { key: e.target.value })}
              />
              <Input
                placeholder={t("attributes.value")}
                value={row.value}
                maxLength={200}
                onChange={(e) => updateRow(index, { value: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(index)}
              >
                {t("attributes.remove")}
              </Button>
            </div>
          ))}
        </div>
        {attributeRows.length < 20 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={addRow}
          >
            {t("attributes.add")}
          </Button>
        )}
      </div>

      <Button type="submit" className="self-start">
        {isEdit ? t("save") : t("create")}
      </Button>
    </form>
  );
}
