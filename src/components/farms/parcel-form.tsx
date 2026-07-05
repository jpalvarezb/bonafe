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
};

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
  const isEdit = Boolean(parcel?.id);
  const action = isEdit ? updateParcelAction : createParcelAction;

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

      <Button type="submit" className="self-start">
        {isEdit ? t("save") : t("create")}
      </Button>
    </form>
  );
}
