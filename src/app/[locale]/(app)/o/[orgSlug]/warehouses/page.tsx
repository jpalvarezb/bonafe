import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listWarehousesWithStats } from "@/server/services/warehouses";
import { listTransfers } from "@/server/services/transfers";
import { listFarms } from "@/server/services/farms";
import {
  createWarehouseAction,
  setDefaultWarehouseAction,
} from "@/server/actions/warehouses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function WarehousesPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "warehouses")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=warehouses`);
  }

  const t = await getTranslations("warehouses");
  const canManage = can(ctx.role, "inventory", "manage");
  const [rows, transfers, farms] = await Promise.all([
    listWarehousesWithStats(ctx),
    listTransfers(ctx),
    listFarms(ctx),
  ]);

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button asChild>
          <Link href={`/o/${orgSlug}/warehouses/transfers/new`}>
            {t("transfers.new")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="divide-y">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.name}
                      {row.isDefault && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {t("default")}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.farmName ?? t("noFarm")} ·{" "}
                      {t("movementCount", { count: row.movementCount })}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-2">
                      {!row.isDefault && (
                        <form action={setDefaultWarehouseAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="id" value={row.id} />
                          <Button type="submit" variant="outline" size="sm">
                            {t("setDefault")}
                          </Button>
                        </form>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/o/${orgSlug}/warehouses/${row.id}`}>
                          {t("edit")}
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createWarehouseAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" required className="w-48" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="farmId">{t("farm")}</Label>
                <select
                  id="farmId"
                  name="farmId"
                  defaultValue=""
                  className={`${selectClass} w-48`}
                >
                  <option value="">{t("noFarm")}</option>
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">{t("create")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("transfers.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("transfers.empty")}</p>
          ) : (
            <div className="divide-y">
              {transfers.map((row) => (
                <div
                  key={row.transfer.id}
                  className="flex flex-col gap-1 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">
                      {row.fromWarehouseName} → {row.toWarehouseName}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {row.transfer.date} ·{" "}
                      {t("transfers.lineCount", { count: row.lineCount })}
                    </span>
                  </div>
                  {row.transfer.notes && (
                    <p className="text-muted-foreground">{row.transfer.notes}</p>
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
