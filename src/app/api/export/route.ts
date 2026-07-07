import { desc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { withOrgRls } from "@/lib/db/rls";
import {
  activities,
  activityTypes,
  farms,
  parcels,
  products,
} from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";

const EXPORT_TYPES = ["activities", "products", "parcels"] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

function isExportType(value: string | null): value is ExportType {
  return EXPORT_TYPES.includes(value as ExportType);
}

async function buildCsv(type: ExportType, orgId: string): Promise<string> {
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
  });
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
  const csv = await buildCsv(type, ctx.org.id);

  // UTF-8 BOM so Excel opens accented characters correctly.
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agropeq-${type}.csv"`,
    },
  });
}
