import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listCycles } from "@/server/services/cycles";
import { listCrops, listVarieties } from "@/server/services/catalog";
import { listParcels } from "@/server/services/parcels";
import { listStages } from "@/server/services/stages";
import {
  closeCycleAction,
  createCycleAction,
  setCycleStageAction,
} from "@/server/actions/cycles";
import { RainActivityTimeline } from "@/components/climate/rain-activity-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

const KNOWN_ERROR_KEYS = ["cycleOverlap"];

export default async function CyclesPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ cycleId?: string; error?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("cycles");
  const sp = await searchParams;
  const errorKey =
    sp.error && KNOWN_ERROR_KEYS.includes(sp.error)
      ? sp.error
      : sp.error
        ? "unknown"
        : null;

  const [cycles, crops, varieties, parcels, stages] = await Promise.all([
    listCycles(ctx),
    listCrops(ctx),
    listVarieties(ctx),
    listParcels(ctx),
    listStages(ctx),
  ]);
  const canCreate = can(ctx.role, "cycle", "create");
  const canSetStage = can(ctx.role, "cycle", "update");
  const today = new Date().toISOString().slice(0, 10);
  const selectClass =
    "border-input h-8 rounded-md border bg-transparent px-2 text-xs shadow-xs";

  const requestedCycle = cycles.find(({ cycle }) => cycle.id === sp.cycleId);
  const defaultCycle =
    cycles.find(({ cycle }) => cycle.status === "active") ?? cycles[0];
  const selectedCycle = requestedCycle ?? defaultCycle;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {errorKey && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${errorKey}`)}
        </p>
      )}

      {cycles.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {cycles.map(({ cycle, cropName, varietyName, parcelName, farmName }) => {
              const cropStageOptions = stages
                .filter((s) => s.cropId === cycle.cropId)
                .sort((a, b) => a.orderIndex - b.orderIndex);
              const currentStage = stages.find(
                (s) => s.id === cycle.currentStageId,
              );
              return (
                <div
                  key={cycle.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{cycle.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {cropName}
                      {varietyName ? ` (${varietyName})` : ""} · {farmName} /{" "}
                      {parcelName} · {cycle.startDate}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("stage")}: {currentStage ? currentStage.name : t("stageNone")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusChip family="life" state={cycle.status}>
                      {t(`status.${cycle.status}`)}
                    </StatusChip>
                    {cycle.status === "active" &&
                      canSetStage &&
                      cropStageOptions.length > 0 && (
                        <form action={setCycleStageAction} className="flex items-center gap-1">
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="cycleId" value={cycle.id} />
                          <select
                            name="stageId"
                            defaultValue={cycle.currentStageId ?? ""}
                            className={selectClass}
                          >
                            <option value="">{t("stageNone")}</option>
                            {cropStageOptions.map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {stage.name}
                              </option>
                            ))}
                          </select>
                          <Button variant="ghost" size="sm" type="submit">
                            {t("stageChange")}
                          </Button>
                        </form>
                      )}
                    {cycle.status === "active" && canCreate && (
                      <form action={closeCycleAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="orgSlug" value={orgSlug} />
                        <input type="hidden" name="cycleId" value={cycle.id} />
                        <input type="hidden" name="endDate" value={today} />
                        <Button variant="ghost" size="sm" type="submit">
                          {t("close")}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {cycles.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("rainSection")}</h2>
          {cycles.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("selectCycle")}:
              </span>
              {cycles.map(({ cycle }) => (
                <Link
                  key={cycle.id}
                  href={`/o/${orgSlug}/cycles?cycleId=${cycle.id}`}
                  className={
                    cycle.id === selectedCycle?.cycle.id
                      ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70"
                  }
                >
                  {cycle.name}
                </Link>
              ))}
            </div>
          )}

          {selectedCycle ? (
            <RainActivityTimeline ctx={ctx} cycleId={selectedCycle.cycle.id} />
          ) : (
            <p className="text-muted-foreground">{t("noCycleSelected")}</p>
          )}
        </div>
      )}

      {canCreate && parcels.length > 0 && crops.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createCycleAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="parcelId">{t("parcel")}</Label>
                <select
                  id="parcelId"
                  name="parcelId"
                  required
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  {parcels.map((parcel) => (
                    <option key={parcel.id} value={parcel.id}>
                      {parcel.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cropId">{t("crop")}</Label>
                <select
                  id="cropId"
                  name="cropId"
                  required
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  {crops.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="varietyId">{t("variety")}</Label>
                <select
                  id="varietyId"
                  name="varietyId"
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">{t("varietyNone")}</option>
                  {varieties.map((variety) => (
                    <option key={variety.id} value={variety.id}>
                      {variety.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="startDate">{t("startDate")}</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="expectedEndDate">{t("expectedEndDate")}</Label>
                <Input
                  id="expectedEndDate"
                  name="expectedEndDate"
                  type="date"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plantedAreaHa">{t("plantedAreaHa")}</Label>
                <Input
                  id="plantedAreaHa"
                  name="plantedAreaHa"
                  type="number"
                  step="0.0001"
                  min="0"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="plantCount">{t("plantCount")}</Label>
                <Input id="plantCount" name="plantCount" type="number" min="0" />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("create")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
