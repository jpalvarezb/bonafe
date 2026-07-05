import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listCrops, listVarieties } from "@/server/services/catalog";
import {
  createCropAction,
  createVarietyAction,
} from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CropsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("catalog.crops");

  const [crops, varieties] = await Promise.all([
    listCrops(ctx),
    listVarieties(ctx),
  ]);
  const canManage = can(ctx.role, "catalog", "manage");
  const path = `/${locale}/o/${orgSlug}/catalog/crops`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {crops.map((crop) => {
          const cropVars = varieties.filter((v) => v.cropId === crop.id);
          return (
            <Card key={crop.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {crop.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {crop.orgId ? t("custom") : t("global")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {crop.scientificName && (
                  <p className="italic text-muted-foreground">
                    {crop.scientificName}
                  </p>
                )}
                <div>
                  <p className="mb-1 font-medium">{t("varieties")}</p>
                  {cropVars.length === 0 ? (
                    <p className="text-muted-foreground">—</p>
                  ) : (
                    <ul className="list-inside list-disc text-muted-foreground">
                      {cropVars.map((v) => (
                        <li key={v.id}>{v.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {canManage && (
                  <form action={createVarietyAction} className="flex gap-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="path" value={path} />
                    <input type="hidden" name="cropId" value={crop.id} />
                    <Input
                      name="name"
                      required
                      placeholder={t("newVariety")}
                      className="h-8"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      {t("addVariety")}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createCropAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="path" value={path} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" required className="w-48" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="scientificName">{t("scientificName")}</Label>
                <Input
                  id="scientificName"
                  name="scientificName"
                  className="w-48"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="defaultCycleDays">{t("cycleDays")}</Label>
                <Input
                  id="defaultCycleDays"
                  name="defaultCycleDays"
                  type="number"
                  min="1"
                  className="w-28"
                />
              </div>
              <Button type="submit">{t("create")}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
