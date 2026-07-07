"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { withOrgRls } from "@/lib/db/rls";
import { farms, importJobs, parcels, products } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

const PRODUCT_CATEGORIES = [
  "fertilizer",
  "agrochemical",
  "seed",
  "tool",
  "fuel",
  "other",
] as const;
type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

type RowError = { row: number; error: string };

const scope = z.object({
  locale: z.string(),
  orgSlug: z.string(),
  type: z.enum(["products", "parcels"]),
});

function cell(row: Record<string, string>, key: string): string | undefined {
  const value = row[key]?.trim();
  return value ? value : undefined;
}

export async function importCsvAction(formData: FormData) {
  const { locale, orgSlug, type } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
    type: formData.get("type"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  assertCan(ctx, "catalog", "manage");

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("missing file");
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: RowError[] = [];
  for (const parseError of parsed.errors) {
    errors.push({
      row: (parseError.row ?? 0) + 2,
      error: `parse error: ${parseError.message}`,
    });
  }
  let imported = 0;
  const productValues: (typeof products.$inferInsert)[] = [];
  const parcelValues: (typeof parcels.$inferInsert)[] = [];

  // Farm-name lookup (for parcels) and the write batch below land in ONE
  // withOrgRls transaction: data rows and the job log must be atomic (a
  // mid-batch failure leaves neither orphaned rows nor a missing history
  // entry), and every query here touches RLS'd tables.
  const importJobId = newId();
  await withOrgRls(ctx.org.id, async (tx) => {
    if (type === "products") {
      const values = productValues;
      parsed.data.forEach((row, i) => {
        // Row number as seen in the file: +1 for the header, +1 for 1-based.
        const rowNumber = i + 2;
        const name = cell(row, "name");
        if (!name) {
          errors.push({ row: rowNumber, error: "missing name" });
          return;
        }
        const rawCategory = cell(row, "category");
        const category: ProductCategory = PRODUCT_CATEGORIES.includes(
          rawCategory as ProductCategory,
        )
          ? (rawCategory as ProductCategory)
          : "other";
        values.push({
          id: newId(),
          orgId: ctx.org.id,
          name,
          category,
          unit: cell(row, "unit") ?? "unidad",
          activeIngredient: cell(row, "active_ingredient") ?? null,
        });
      });
      imported = values.length;
    } else {
      const orgFarms = await tx
        .select({ id: farms.id, name: farms.name })
        .from(farms)
        .where(eq(farms.orgId, ctx.org.id));
      const farmIdByName = new Map(orgFarms.map((f) => [f.name, f.id]));

      const values = parcelValues;
      parsed.data.forEach((row, i) => {
        const rowNumber = i + 2;
        const name = cell(row, "name");
        const farmName = cell(row, "farm");
        if (!name) {
          errors.push({ row: rowNumber, error: "missing name" });
          return;
        }
        if (!farmName) {
          errors.push({ row: rowNumber, error: "missing farm" });
          return;
        }
        const farmId = farmIdByName.get(farmName);
        if (!farmId) {
          errors.push({ row: rowNumber, error: `farm not found: ${farmName}` });
          return;
        }
        const rawArea = cell(row, "area_ha");
        if (rawArea !== undefined && !/^\d{1,8}([.,]\d{1,4})?$/.test(rawArea)) {
          errors.push({
            row: rowNumber,
            error: `invalid area_ha: ${rawArea}`,
          });
          return;
        }
        values.push({
          id: newId(),
          orgId: ctx.org.id,
          farmId,
          name,
          code: cell(row, "code") ?? null,
          soilType: cell(row, "soil_type") ?? null,
          areaHa: rawArea !== undefined ? rawArea.replace(",", ".") : null,
        });
      });
      imported = values.length;
    }

    if (productValues.length > 0) {
      await tx.insert(products).values(productValues);
    }
    if (parcelValues.length > 0) {
      await tx.insert(parcels).values(parcelValues);
    }
    await tx.insert(importJobs).values({
      id: importJobId,
      orgId: ctx.org.id,
      type,
      fileName: file.name,
      status: imported === 0 && errors.length > 0 ? "failed" : "done",
      rowsImported: imported,
      errorReport: errors,
      createdBy: ctx.user.id,
    });
  });

  await audit(ctx, "import.run", {
    entity: "import_job",
    entityId: importJobId,
    meta: { type, rows: imported },
  });

  revalidatePath(`/${locale}/o/${orgSlug}/settings/import`);
}
