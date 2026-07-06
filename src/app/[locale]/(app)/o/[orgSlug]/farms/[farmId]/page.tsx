import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getFarm } from "@/server/services/farms";
import { listParcels } from "@/server/services/parcels";
import {
  setFarmActiveAction,
  setParcelActiveAction,
} from "@/server/actions/farms";
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
  const parcels = await listParcels(ctx, farmId, { includeInactive: true });

  const canEditParcel = can(ctx.role, "parcel", "create");
  const canDeleteFarm = can(ctx.role, "farm", "delete");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{farm.name}</h1>
            {!farm.active && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {t("status.inactive")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {farm.areaHa ? `${farm.areaHa} ha` : ""}
          </p>
        </div>
        {canDeleteFarm && (
          <form action={setFarmActiveAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="farmId" value={farm.id} />
            <input
              type="hidden"
              name="active"
              value={(!farm.active).toString()}
            />
            <Button
              variant={farm.active ? "destructive" : "outline"}
              size="sm"
              type="submit"
            >
              {t(farm.active ? "deactivate" : "reactivate")}
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
              {parcels.map((parcel) => {
                const attributes = Object.entries(
                  (parcel.attributes as Record<string, string> | null) ?? {},
                );
                return (
                <div
                  key={parcel.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{parcel.name}</p>
                      {!parcel.active && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {t("parcels.status.inactive")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {parcel.code ? `${parcel.code} · ` : ""}
                      {parcel.areaHa ? `${parcel.areaHa} ha` : "—"}
                    </p>
                    {attributes.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {attributes.map(([key, value]) => (
                          <span
                            key={key}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}
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
                        <form action={setParcelActiveAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="farmId" value={farm.id} />
                          <input
                            type="hidden"
                            name="parcelId"
                            value={parcel.id}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={(!parcel.active).toString()}
                          />
                          <Button variant="ghost" size="sm" type="submit">
                            {t(
                              parcel.active
                                ? "parcels.deactivate"
                                : "parcels.reactivate",
                            )}
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
