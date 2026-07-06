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
import { ingestClimateAction } from "@/server/actions/climate-ingest";
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

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

const INGEST_ERROR_KEYS = [
  "farmNotFound",
  "noParcels",
  "invalidRange",
  "rangeTooLong",
  "providerUnavailable",
];

const SOURCE_LABEL_KEYS: Record<string, string> = {
  manual: "sourceManual",
  open_meteo: "sourceOpenMeteo",
  chirps: "sourceChirps",
  station: "sourceStation",
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function ClimatePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{
    farm?: string;
    ingested?: string;
    provider?: string;
    error?: string;
  }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("climate");
  const sp = await searchParams;

  const farmsList = await listFarms(ctx, { includeInactive: true });

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
  const thirtyDaysAgo = isoDaysAgo(30);

  const ingestErrorKey =
    sp.error && INGEST_ERROR_KEYS.includes(sp.error) ? sp.error : sp.error ? "unknown" : null;
  const parsedIngested = sp.ingested ? Number(sp.ingested) : null;
  const ingestedCount = Number.isFinite(parsedIngested) ? parsedIngested : null;
  const ingestedProviderKey =
    sp.provider === "chirps" ? "sourceChirps" : "sourceOpenMeteo";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {ingestErrorKey && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`ingest.errors.${ingestErrorKey}`)}
        </p>
      )}

      {ingestedCount !== null && !ingestErrorKey && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {t("ingest.success", { count: ingestedCount })} —{" "}
          {t(ingestedProviderKey)}
        </div>
      )}

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
            <CardTitle>{t("ingest.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={ingestClimateAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="ingestFarmId">{t("ingest.farm")}</Label>
                <select
                  id="ingestFarmId"
                  name="farmId"
                  required
                  defaultValue={activeFarmId}
                  className={selectClass}
                >
                  {farmsList.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ingestProvider">{t("ingest.provider")}</Label>
                <select
                  id="ingestProvider"
                  name="provider"
                  required
                  defaultValue="open_meteo"
                  className={selectClass}
                >
                  <option value="open_meteo">
                    {t("ingest.providerOpenMeteo")}
                  </option>
                  <option value="chirps">{t("ingest.providerChirps")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ingestFrom">{t("ingest.from")}</Label>
                <Input
                  id="ingestFrom"
                  name="from"
                  type="date"
                  required
                  defaultValue={thirtyDaysAgo}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ingestTo">{t("ingest.to")}</Label>
                <Input
                  id="ingestTo"
                  name="to"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("ingest.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

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
                    <p className="font-medium">
                      {reading.date}{" "}
                      <span className="font-normal text-muted-foreground">
                        ·{" "}
                        {t(
                          SOURCE_LABEL_KEYS[reading.source] ?? "sourceManual",
                        )}
                      </span>
                    </p>
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
