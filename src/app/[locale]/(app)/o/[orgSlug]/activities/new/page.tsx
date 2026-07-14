import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { listParcels } from "@/server/services/parcels";
import { listCycles } from "@/server/services/cycles";
import {
  listActivityTypes,
  listProducts,
} from "@/server/services/catalog";
import { ActivityForm } from "@/components/activities/activity-form";
import { listCostCenters } from "@/server/services/cost-centers";
import { listActiveWorkers } from "@/server/services/workers";
import { getStockByProduct } from "@/server/services/inventory";
import { defaultUnitCostByProduct } from "@/lib/calc/activity-costing";
import { CURRENCY_CODES } from "@/lib/currency";

export default async function NewActivityPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("activities");

  const [parcels, cycles, activityTypes, products, costCenters, workers, stock] =
    await Promise.all([
      listParcels(ctx),
      listCycles(ctx, { status: "active" }),
      listActivityTypes(ctx),
      listProducts(ctx),
      listCostCenters(ctx),
      listActiveWorkers(ctx),
      getStockByProduct(ctx),
    ]);

  // Prefill for the WAC-derived input unit cost — one lookup per product,
  // scoped to the default warehouse row (see defaultUnitCostByProduct).
  const unitCostByProduct: Record<string, string> = {};
  for (const productId of new Set(stock.map((row) => row.productId))) {
    const cost = defaultUnitCostByProduct(stock, productId);
    if (cost) unitCostByProduct[productId] = cost;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      <ActivityForm
        locale={locale}
        orgSlug={orgSlug}
        parcels={parcels.map((p) => ({ id: p.id, name: p.name }))}
        cycles={cycles.map(({ cycle }) => ({
          id: cycle.id,
          name: cycle.name,
          parcelId: cycle.parcelId,
        }))}
        activityTypes={activityTypes.map((a) => ({ id: a.id, name: a.name }))}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        costCenters={costCenters.map((c) => ({ id: c.id, name: c.name }))}
        workers={workers.map((w) => ({ id: w.id, name: w.name }))}
        unitCostByProduct={unitCostByProduct}
        currencyCode={ctx.org.baseCurrencyCode}
        currencies={CURRENCY_CODES}
      />
    </div>
  );
}
