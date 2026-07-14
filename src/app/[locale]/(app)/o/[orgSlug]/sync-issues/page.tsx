import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { listParcels } from "@/server/services/parcels";
import { listCycles } from "@/server/services/cycles";
import {
  listActiveWorkersForPiecework,
  listPieceRates,
} from "@/server/services/piecework";
import { listActivityTypes, listProducts } from "@/server/services/catalog";
import { listCostCenters } from "@/server/services/cost-centers";
import { getStockByProduct } from "@/server/services/inventory";
import { defaultUnitCostByProduct } from "@/lib/calc/activity-costing";
import { CURRENCY_CODES } from "@/lib/currency";
import { SyncIssuesList } from "@/components/offline/sync-issues-list";
import { SyncIssueEditPanel } from "@/components/offline/sync-issue-edit-panel";

export default async function SyncIssuesPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ edit?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("offline");

  // Reference data for the per-item edit view below (harvest/monitoring/
  // activity/piecework capture forms) — fetched once here since the edit
  // panel needs the same option lists their own capture pages pass in.
  const [parcels, cycles, workers, rates, activityTypes, products, costCenters, stock] =
    await Promise.all([
      listParcels(ctx),
      listCycles(ctx, { status: "active" }),
      listActiveWorkersForPiecework(ctx),
      listPieceRates(ctx, { activeOnly: true }),
      listActivityTypes(ctx),
      listProducts(ctx),
      listCostCenters(ctx),
      getStockByProduct(ctx),
    ]);

  const unitCostByProduct: Record<string, string> = {};
  for (const productId of new Set(stock.map((row) => row.productId))) {
    const cost = defaultUnitCostByProduct(stock, productId);
    if (cost) unitCostByProduct[productId] = cost;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("issues.title")}</h1>
      <SyncIssuesList orgSlug={orgSlug} />
      <SyncIssueEditPanel
        locale={locale}
        orgSlug={orgSlug}
        editId={sp.edit ?? null}
        parcels={parcels.map((p) => ({ id: p.id, name: p.name }))}
        cycles={cycles.map(({ cycle }) => ({
          id: cycle.id,
          name: cycle.name,
          parcelId: cycle.parcelId,
        }))}
        workers={workers}
        rates={rates.map((rate) => ({
          id: rate.id,
          name: rate.name,
          unit: rate.unit,
        }))}
        activityTypes={activityTypes.map((a) => ({ id: a.id, name: a.name }))}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        costCenters={costCenters.map((c) => ({ id: c.id, name: c.name }))}
        unitCostByProduct={unitCostByProduct}
        currencyCode={ctx.org.baseCurrencyCode}
        currencies={CURRENCY_CODES}
      />
    </div>
  );
}
