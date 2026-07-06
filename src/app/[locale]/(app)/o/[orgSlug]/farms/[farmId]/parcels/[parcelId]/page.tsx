import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { parcels } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { ParcelForm } from "@/components/farms/parcel-form";
import type { GeoJsonPolygon } from "@/lib/db/geometry";

export default async function EditParcelPage({
  params,
}: Readonly<{
  params: Promise<{
    locale: string;
    orgSlug: string;
    farmId: string;
    parcelId: string;
  }>;
}>) {
  const { locale, orgSlug, farmId, parcelId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("farms");

  const [parcel] = await db
    .select()
    .from(parcels)
    .where(and(eq(parcels.id, parcelId), eq(parcels.orgId, ctx.org.id)))
    .limit(1);
  if (!parcel || parcel.farmId !== farmId) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {parcel.name} · {t("parcels.edit")}
      </h1>
      <ParcelForm
        locale={locale}
        orgSlug={orgSlug}
        farmId={farmId}
        parcel={{
          id: parcel.id,
          name: parcel.name,
          code: parcel.code,
          soilType: parcel.soilType,
          areaHa: parcel.areaHa,
          boundary: parcel.boundary as GeoJsonPolygon | null,
          attributes: parcel.attributes as Record<string, string> | null,
        }}
      />
    </div>
  );
}
