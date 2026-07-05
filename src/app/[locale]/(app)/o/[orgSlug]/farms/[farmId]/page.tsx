import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getFarm } from "@/server/services/farms";
import { listParcels } from "@/server/services/parcels";
import { deleteFarmAction, deleteParcelAction } from "@/server/actions/farms";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ParcelsOverviewMap,
} from "@/components/map/parcels-overview-map";
import type { GeoJsonPolygon } from "@/lib/db/geometry";

export default async function FarmDetailPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; farmId: string }>;
}>) {
  const { locale, orgSlug, farmId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("farms");

  const farm = await getFarm(ctx, farmId);
  if (!farm) notFound();
  const parcels = await listParcels(ctx, farmId);

  const canEditParcel = can(ctx.role, "parcel", "create");
  const canDeleteFarm = can(ctx.role, "farm", "delete");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{farm.name}</h1>
          <p className="text-sm text-muted-foreground">
            {farm.areaHa ? `${farm.areaHa} ha` : ""}
          </p>
        </div>
        {canDeleteFarm && (
          <form action={deleteFarmAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="farmId" value={farm.id} />
            <Button variant="destructive" size="sm" type="submit">
              {t("delete")}
            </Button>
          </form>
        )}
      </div>

      {parcels.some((p) => p.boundary) && (
        <ParcelsOverviewMap
          heightClass="h-80"
          parcels={parcels.map((p) => ({
            id: p.id,
            name: p.name,
            boundary: p.boundary as GeoJsonPolygon | null,
          }))}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("parcels.title")}</CardTitle>
          {canEditParcel && (
            <Button asChild size="sm">
              <Link href={`/o/${orgSlug}/farms/${farm.id}/parcels/new`}>
                {t("parcels.new")}
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {parcels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("parcels.empty")}
            </p>
          ) : (
            <div className="divide-y">
              {parcels.map((parcel) => (
                <div
                  key={parcel.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium">{parcel.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {parcel.code ? `${parcel.code} · ` : ""}
                      {parcel.areaHa ? `${parcel.areaHa} ha` : "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canEditParcel && (
                      <>
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/o/${orgSlug}/farms/${farm.id}/parcels/${parcel.id}`}
                          >
                            {t("parcels.edit")}
                          </Link>
                        </Button>
                        <form action={deleteParcelAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="farmId" value={farm.id} />
                          <input
                            type="hidden"
                            name="parcelId"
                            value={parcel.id}
                          />
                          <Button variant="ghost" size="sm" type="submit">
                            {t("parcels.delete")}
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
