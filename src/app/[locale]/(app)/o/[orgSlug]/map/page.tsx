import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { farms, parcels } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { ParcelsOverviewMap } from "@/components/map/parcels-overview-map";
import type { GeoJsonPolygon } from "@/lib/db/geometry";

export default async function OrgMapPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("farms");

  const rows = await db
    .select({ parcel: parcels, farmName: farms.name })
    .from(parcels)
    .innerJoin(farms, eq(parcels.farmId, farms.id))
    .where(eq(parcels.orgId, ctx.org.id));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("map.allParcels")}</h1>
      <ParcelsOverviewMap
        parcels={rows.map(({ parcel, farmName }) => ({
          id: parcel.id,
          name: parcel.name,
          farmName,
          boundary: parcel.boundary as GeoJsonPolygon | null,
        }))}
      />
    </div>
  );
}
