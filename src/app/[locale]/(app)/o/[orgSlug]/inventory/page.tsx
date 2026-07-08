import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  ensureDefaultWarehouse,
  getStockByProduct,
  listWarehouses,
} from "@/server/services/inventory";
import { listProducts } from "@/server/services/catalog";
import { AdjustmentForm } from "@/components/inventory/adjustment-form";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

export default async function InventoryPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "inventory")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=inventory`);
  }

  const t = await getTranslations("inventory");
  const format = await getFormatter();
  // recordAdjustmentAction -> recordAdjustment requires inventory:manage
  // (src/server/services/inventory.ts); mirrors the warehouses page idiom
  // of hiding the create form for roles that can't submit it.
  const canManage = can(ctx.role, "inventory", "manage");

  // Guarantee at least one warehouse exists so the adjustment form has an option.
  await ensureDefaultWarehouse(ctx);

  const [stock, warehouses, products] = await Promise.all([
    getStockByProduct(ctx),
    listWarehouses(ctx),
    listProducts(ctx),
  ]);

  const totalValue = stock
    .reduce((sum, row) => sum.add(new Decimal(row.totalValue)), new Decimal(0))
    .toFixed(2);

  const baseCurrency = ctx.org.baseCurrencyCode;
  const money = (value: string | number) =>
    format.number(Number(value), {
      style: "currency",
      currency: baseCurrency,
      maximumFractionDigits: 2,
    });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardContent>
          {stock.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">
                        {t("table.product")}
                      </th>
                      <th className="py-2 pr-4 font-medium">
                        {t("table.warehouse")}
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        {t("table.quantity")}
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        {t("table.avgCost")}
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        {t("table.totalValue")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stock.map((row) => {
                      const low =
                        row.minStock != null &&
                        new Decimal(row.quantity).lt(new Decimal(row.minStock));
                      return (
                        <tr key={`${row.warehouseId}:${row.productId}`}>
                          <td className="py-2 pr-4">
                            {row.productName}
                            {low && (
                              <StatusChip
                                family="sev"
                                state="medium"
                                className="ml-2"
                              >
                                {t("table.lowStock")}
                              </StatusChip>
                            )}
                          </td>
                          <td className="py-2 pr-4">{row.warehouseName}</td>
                          <td className="py-2 pr-4 text-right">
                            {row.quantity} {row.unit}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {money(row.avgUnitCost)}
                          </td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {money(row.totalValue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end text-lg font-semibold">
                {t("table.totalInventoryValue")}: {money(totalValue)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <AdjustmentForm
          locale={locale}
          orgSlug={orgSlug}
          products={products.map((p) => ({ id: p.id, name: p.name }))}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        />
      )}
    </div>
  );
}
