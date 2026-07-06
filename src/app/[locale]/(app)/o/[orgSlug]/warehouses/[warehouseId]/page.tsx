import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { getWarehouse } from "@/server/services/warehouses";
import { listFarms } from "@/server/services/farms";
import { updateWarehouseAction } from "@/server/actions/warehouses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EditWarehousePage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; warehouseId: string }>;
}>) {
  const { locale, orgSlug, warehouseId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "warehouses")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=warehouses`);
  }
  if (!can(ctx.role, "inventory", "manage")) {
    redirect(`/${locale}/o/${orgSlug}/warehouses`);
  }

  const t = await getTranslations("warehouses");
  const [warehouse, farms] = await Promise.all([
    getWarehouse(ctx, warehouseId),
    listFarms(ctx),
  ]);
  if (!warehouse) notFound();

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{warehouse.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("edit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateWarehouseAction} className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="id" value={warehouse.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input
                id="name"
                name="name"
                defaultValue={warehouse.name}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="farmId">{t("farm")}</Label>
              <select
                id="farmId"
                name="farmId"
                defaultValue={warehouse.farmId ?? ""}
                className={selectClass}
              >
                <option value="">{t("noFarm")}</option>
                {farms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="self-start">
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
