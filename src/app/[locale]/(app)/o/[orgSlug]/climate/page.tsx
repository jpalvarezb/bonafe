import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listFarms } from "@/server/services/farms";
import { listClimateReadings } from "@/server/services/climate";
import {
  deleteClimateAction,
  upsertClimateAction,
} from "@/server/actions/climate";
import { ClimateCharts } from "@/components/climate/climate-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ClimatePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ farm?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("climate");
  const sp = await searchParams;

  const farmsList = await listFarms(ctx);

  if (farmsList.length === 0) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("noFarms")}</p>
      </div>
    );
  }

  const activeFarmId =
    farmsList.find((farm) => farm.id === sp.farm)?.id ?? farmsList[0].id;

  const readings = await listClimateReadings(ctx, activeFarmId, {
    days: 90,
  });
  const latestReadings = [...readings].reverse().slice(0, 15);

  const canCreate = can(ctx.role, "climate", "create");
  const canDelete = can(ctx.role, "climate", "delete");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {farmsList.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {farmsList.map((farm) => (
            <Link
              key={farm.id}
              href={`/o/${orgSlug}/climate?farm=${farm.id}`}
              className={
                farm.id === activeFarmId
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70"
              }
            >
              {farm.name}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("charts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ClimateCharts
            readings={readings.map((reading) => ({
              date: reading.date,
              rainfallMm: reading.rainfallMm,
              tempMinC: reading.tempMinC,
              tempMaxC: reading.tempMaxC,
            }))}
          />
        </CardContent>
      </Card>

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{t("newReading")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={upsertClimateAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="farmId" value={activeFarmId} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="date">{t("date")}</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rainfallMm">{t("rainfall")}</Label>
                <Input
                  id="rainfallMm"
                  name="rainfallMm"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tempMinC">{t("tempMinC")}</Label>
                <Input id="tempMinC" name="tempMinC" type="number" step="0.01" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tempMaxC">{t("tempMaxC")}</Label>
                <Input id="tempMaxC" name="tempMaxC" type="number" step="0.01" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="humidityPct">{t("humidity")}</Label>
                <Input
                  id="humidityPct"
                  name="humidityPct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {latestReadings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="divide-y">
              {latestReadings.map((reading) => (
                <div
                  key={reading.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{reading.date}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {t("rainfall")}: {reading.rainfallMm ?? "—"} ·{" "}
                      {t("tempMinC")}: {reading.tempMinC ?? "—"} ·{" "}
                      {t("tempMaxC")}: {reading.tempMaxC ?? "—"} ·{" "}
                      {t("humidity")}: {reading.humidityPct ?? "—"}
                    </p>
                  </div>
                  {canDelete && (
                    <form action={deleteClimateAction} className="shrink-0">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="id" value={reading.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        {t("delete")}
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
