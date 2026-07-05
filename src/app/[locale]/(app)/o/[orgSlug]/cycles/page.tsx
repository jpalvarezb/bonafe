import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listCycles } from "@/server/services/cycles";
import { listCrops, listVarieties } from "@/server/services/catalog";
import { listParcels } from "@/server/services/parcels";
import { closeCycleAction, createCycleAction } from "@/server/actions/cycles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CyclesPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("cycles");

  const [cycles, crops, varieties, parcels] = await Promise.all([
    listCycles(ctx),
    listCrops(ctx),
    listVarieties(ctx),
    listParcels(ctx),
  ]);
  const canCreate = can(ctx.role, "cycle", "create");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {cycles.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {cycles.map(({ cycle, cropName, varietyName, parcelName, farmName }) => (
              <div
                key={cycle.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">{cycle.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {cropName}
                    {varietyName ? ` (${varietyName})` : ""} · {farmName} /{" "}
                    {parcelName} · {cycle.startDate}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      cycle.status === "active"
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100"
                        : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    }
                  >
                    {t(`status.${cycle.status}`)}
                  </span>
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
            ))}
          </CardContent>
        </Card>
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
