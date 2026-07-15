import { asc, desc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { withOrgRls } from "@/lib/db/rls";
import {
  activities,
  activityTypes,
  cropCycles,
  farms,
  harvests,
  parcels,
  payrollEntries,
  payrollPeriods,
  products,
  purchaseLines,
  purchases,
  saleLines,
  sales,
  suppliers,
  workers,
} from "@/lib/db/schema";
import { requireOrgContext, type OrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { getStockByProduct } from "@/server/services/inventory";
import {
  buildHarvestsCsv,
  buildInventoryCsv,
  buildPayrollCsv,
  buildPurchasesCsv,
  buildSalesCsv,
} from "@/lib/export/csv";

const LEGACY_EXPORT_TYPES = ["activities", "products", "parcels"] as const;
const NEW_EXPORT_TYPES = [
  "payroll",
  "sales",
  "harvests",
  "inventory",
  "purchases",
] as const;
const EXPORT_TYPES = [...LEGACY_EXPORT_TYPES, ...NEW_EXPORT_TYPES] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

function isExportType(value: string | null): value is ExportType {
  return EXPORT_TYPES.includes(value as ExportType);
}

// Mirrors each screen's hasFeature(getOrgPlan(...)) gate: payroll/harvests/
// sales/inventory pages redirect on these keys; purchases gates on
// "inventory" too (src/app/[locale]/(app)/o/[orgSlug]/purchases/page.tsx).
const NEW_EXPORT_FEATURE: Record<(typeof NEW_EXPORT_TYPES)[number], string> = {
  payroll: "payroll",
  sales: "sales",
  harvests: "harvest",
  inventory: "inventory",
  purchases: "inventory",
};

async function buildCsv(type: ExportType, ctx: OrgContext): Promise<string> {
  const orgId = ctx.org.id;

  // getStockByProduct already runs its own withOrgRls + weighted-average
  // math (src/server/services/inventory.ts) — do not re-derive it here.
  if (type === "inventory") {
    const rows = await getStockByProduct(ctx);
    return buildInventoryCsv(
      rows.map((r) => ({
        productName: r.productName,
        warehouseName: r.warehouseName,
        quantity: r.quantity,
        avgUnitCost: r.avgUnitCost,
        totalValue: r.totalValue,
        minStock: r.minStock,
      })),
    );
  }

  return withOrgRls(orgId, async (tx) => {
    if (type === "activities") {
      const rows = await tx
        .select({
          date: activities.date,
          type: activityTypes.name,
          parcel: parcels.name,
          description: activities.description,
          laborCost: activities.laborCost,
          inputCost: activities.inputCost,
          machineCost: activities.machineCost,
          otherCost: activities.otherCost,
          totalCost: activities.totalCost,
          currency: activities.currencyCode,
        })
        .from(activities)
        .innerJoin(
          activityTypes,
          eq(activities.activityTypeId, activityTypes.id),
        )
        .leftJoin(parcels, eq(activities.parcelId, parcels.id))
        .where(eq(activities.orgId, orgId))
        .orderBy(desc(activities.date));

      return Papa.unparse({
        fields: [
          "date",
          "type",
          "parcel",
          "description",
          "labor_cost",
          "input_cost",
          "machine_cost",
          "other_cost",
          "total_cost",
          "currency",
        ],
        data: rows.map((r) => [
          r.date,
          r.type,
          r.parcel ?? "",
          r.description ?? "",
          r.laborCost,
          r.inputCost,
          r.machineCost,
          r.otherCost,
          r.totalCost,
          r.currency,
        ]),
      });
    }

    if (type === "products") {
      const rows = await tx
        .select({
          name: products.name,
          category: products.category,
          unit: products.unit,
          activeIngredient: products.activeIngredient,
        })
        .from(products)
        .where(eq(products.orgId, orgId))
        .orderBy(products.name);

      return Papa.unparse({
        fields: ["name", "category", "unit", "active_ingredient"],
        data: rows.map((r) => [
          r.name,
          r.category,
          r.unit,
          r.activeIngredient ?? "",
        ]),
      });
    }

    if (type === "parcels") {
      const rows = await tx
        .select({
          farm: farms.name,
          name: parcels.name,
          code: parcels.code,
          soilType: parcels.soilType,
          areaHa: parcels.areaHa,
        })
        .from(parcels)
        .innerJoin(farms, eq(parcels.farmId, farms.id))
        .where(eq(parcels.orgId, orgId))
        .orderBy(farms.name, parcels.name);

      return Papa.unparse({
        fields: ["farm", "name", "code", "soil_type", "area_ha"],
        data: rows.map((r) => [
          r.farm,
          r.name,
          r.code ?? "",
          r.soilType ?? "",
          r.areaHa ?? "",
        ]),
      });
    }

    if (type === "payroll") {
      const rows = await tx
        .select({
          periodName: payrollPeriods.name,
          periodStart: payrollPeriods.startDate,
          periodEnd: payrollPeriods.endDate,
          periodStatus: payrollPeriods.status,
          workerName: workers.name,
          daysWorked: payrollEntries.daysWorked,
          hoursWorked: payrollEntries.hoursWorked,
          baseAmount: payrollEntries.baseAmount,
          overtimeAmount: payrollEntries.overtimeAmount,
          pieceworkAmount: payrollEntries.pieceworkAmount,
          netAmount: payrollEntries.netAmount,
        })
        .from(payrollEntries)
        .innerJoin(
          payrollPeriods,
          eq(payrollEntries.periodId, payrollPeriods.id),
        )
        .innerJoin(workers, eq(payrollEntries.workerId, workers.id))
        .where(eq(payrollEntries.orgId, orgId))
        .orderBy(desc(payrollPeriods.startDate), asc(workers.name));

      return buildPayrollCsv(rows);
    }

    if (type === "sales") {
      // One row per sale line; the sale header (buyer/currency/exchange
      // rate/crop cycle/processing run) repeats across a multi-line sale.
      const rows = await tx
        .select({
          date: sales.date,
          buyerName: sales.buyerName,
          currencyCode: sales.currencyCode,
          exchangeRate: sales.exchangeRate,
          cropCycleName: cropCycles.name,
          processingRunName: sales.processingRunId,
          lineDescription: saleLines.description,
          lineQuantity: saleLines.quantity,
          lineUnit: saleLines.unit,
          lineUnitPrice: saleLines.unitPrice,
          lineAmount: saleLines.total,
        })
        .from(saleLines)
        .innerJoin(sales, eq(saleLines.saleId, sales.id))
        .leftJoin(cropCycles, eq(sales.cropCycleId, cropCycles.id))
        .where(eq(sales.orgId, orgId))
        .orderBy(desc(sales.date), asc(saleLines.createdAt));

      return buildSalesCsv(rows);
    }

    if (type === "harvests") {
      // Mirrors listHarvests' join shape (src/server/services/harvests.ts)
      // but WITHOUT its .limit(200) cap — an export must not silently
      // truncate an org's full harvest history.
      const rows = await tx
        .select({
          date: harvests.date,
          parcelName: parcels.name,
          cropCycleName: cropCycles.name,
          workerName: workers.name,
          quantity: harvests.quantity,
          unit: harvests.unit,
          qualityGrade: harvests.qualityGrade,
        })
        .from(harvests)
        .innerJoin(parcels, eq(harvests.parcelId, parcels.id))
        .leftJoin(cropCycles, eq(harvests.cropCycleId, cropCycles.id))
        .leftJoin(workers, eq(harvests.workerId, workers.id))
        .where(eq(harvests.orgId, orgId))
        .orderBy(desc(harvests.date));

      return buildHarvestsCsv(rows);
    }

    // type === "purchases": one row per purchase line.
    const rows = await tx
      .select({
        date: purchases.date,
        supplierName: suppliers.name,
        currencyCode: purchases.currencyCode,
        exchangeRate: purchases.exchangeRate,
        productName: products.name,
        unit: products.unit,
        quantity: purchaseLines.quantity,
        unitCost: purchaseLines.unitCost,
        lineTotal: purchaseLines.total,
      })
      .from(purchaseLines)
      .innerJoin(purchases, eq(purchaseLines.purchaseId, purchases.id))
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .innerJoin(products, eq(purchaseLines.productId, products.id))
      .where(eq(purchases.orgId, orgId))
      .orderBy(desc(purchases.date), asc(purchaseLines.createdAt));

    return buildPurchasesCsv(rows);
  });
}

function isNewExportType(
  type: ExportType,
): type is (typeof NEW_EXPORT_TYPES)[number] {
  return (NEW_EXPORT_TYPES as readonly string[]).includes(type);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const orgSlug = searchParams.get("org");
  const locale = searchParams.get("locale") ?? "es";

  if (!isExportType(type) || !orgSlug) {
    return new Response("Bad request", { status: 400 });
  }

  const ctx = await requireOrgContext(locale, orgSlug);

  if (isNewExportType(type)) {
    // The 3 legacy export types (activities/products/parcels) keep their
    // original, permission-check-free behavior; only the 5 new domains gate
    // on report:view + the screen's own plan feature.
    if (!can(ctx.role, "report", "view")) {
      return new Response("Forbidden", { status: 403 });
    }
    const plan = await getOrgPlan(ctx.org.id);
    if (!hasFeature(plan, NEW_EXPORT_FEATURE[type])) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const csv = await buildCsv(type, ctx);

  // UTF-8 BOM so Excel opens accented characters correctly.
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agropeq-${type}.csv"`,
    },
  });
}
