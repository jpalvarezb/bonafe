import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listCrops } from "@/server/services/catalog";
import { listStages } from "@/server/services/stages";
import { createStageAction, deleteStageAction } from "@/server/actions/stages";
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

export default async function StagesCatalogPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("cycles.stageCatalog");

  const [crops, stages] = await Promise.all([
    listCrops(ctx),
    listStages(ctx),
  ]);
  const canManage = can(ctx.role, "catalog", "manage");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {crops.map((crop) => {
          const cropStages = stages
            .filter((s) => s.cropId === crop.id)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          return (
            <Card key={crop.id}>
              <CardHeader>
                <CardTitle className="text-base">{crop.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {cropStages.length === 0 ? (
                  <p className="text-muted-foreground">{t("empty")}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {cropStages.map((stage) => (
                      <li
                        key={stage.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>
                          {stage.orderIndex}. {stage.name}
                          {stage.typicalDurationDays
                            ? ` · ${stage.typicalDurationDays}${t("daysSuffix")}`
                            : ""}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {stage.orgId ? t("custom") : t("global")}
                          </span>
                        </span>
                        {canManage && stage.orgId === ctx.org.id && (
                          <form action={deleteStageAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="orgSlug" value={orgSlug} />
                            <input
                              type="hidden"
                              name="stageId"
                              value={stage.id}
                            />
                            <Button variant="ghost" size="sm" type="submit">
                              {t("delete")}
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canManage && crops.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createStageAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="cropId">{t("crop")}</Label>
                <select
                  id="cropId"
                  name="cropId"
                  required
                  className={selectClass}
                >
                  {crops.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="orderIndex">{t("orderIndex")}</Label>
                <Input
                  id="orderIndex"
                  name="orderIndex"
                  type="number"
                  min="0"
                  defaultValue={0}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="typicalDurationDays">{t("duration")}</Label>
                <Input
                  id="typicalDurationDays"
                  name="typicalDurationDays"
                  type="number"
                  min="0"
                />
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
