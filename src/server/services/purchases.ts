import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import Decimal from "decimal.js";
import { withOrgRls } from "@/lib/db/rls";
import {
  inventoryMovements,
  products,
  purchaseLines,
  purchases,
  suppliers,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import { inputLineTotal } from "@/lib/calc/costs";
import { latestRateToBaseInTx } from "@/server/services/exchange-rates";
import { ensureDefaultWarehouseInTx } from "@/server/services/inventory";

export type PurchaseLineInput = {
  productId: string;
  quantity: string;
  unitCost: string;
};

export type PurchaseInput = {
  supplierId: string;
  date: string;
  invoiceNumber?: string | null;
  currencyCode?: string;
  notes?: string | null;
  lines: PurchaseLineInput[];
};

export async function createPurchase(ctx: OrgContext, input: PurchaseInput) {
  assertCan(ctx, "purchase", "create");
  await assertOrgFeature(ctx.org.id, "inventory");

  if (input.lines.length === 0) {
    throw new Error("purchase must have at least one line");
  }

  return withOrgRls(ctx.org.id, async (tx) => {
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(eq(suppliers.id, input.supplierId), eq(suppliers.orgId, ctx.org.id)),
      )
      .limit(1);
    if (!supplier) throw new Error("supplier not found");

    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const ownedProducts = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.id, productIds), eq(products.orgId, ctx.org.id)));
    if (ownedProducts.length !== productIds.length) {
      throw new Error("product not found");
    }

    const warehouse = await ensureDefaultWarehouseInTx(tx, ctx);

    const currencyCode = input.currencyCode ?? ctx.org.baseCurrencyCode;
    const exchangeRate =
      currencyCode === ctx.org.baseCurrencyCode
        ? "1"
        : await latestRateToBaseInTx(tx, ctx, currencyCode, input.date);
    if (exchangeRate == null) {
      throw new Error("missing exchange rate for " + currencyCode);
    }

    const lineTotals = input.lines.map((line) => inputLineTotal(line));
    const subtotal = lineTotals
      .reduce((sum, total) => sum.add(new Decimal(total)), new Decimal(0))
      .toFixed(4);
    // No tax in Phase 4 — total mirrors subtotal.
    const total = subtotal;

    const purchaseId = newId();

    const [created] = await tx
      .insert(purchases)
      .values({
        id: purchaseId,
        orgId: ctx.org.id,
        supplierId: input.supplierId,
        warehouseId: warehouse.id,
        date: input.date,
        invoiceNumber: input.invoiceNumber ?? null,
        currencyCode,
        exchangeRate,
        subtotal,
        total,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    const lineRows = input.lines.map((line, i) => ({
      id: newId(),
      orgId: ctx.org.id,
      purchaseId,
      productId: line.productId,
      quantity: String(line.quantity),
      unitCost: String(line.unitCost),
      total: lineTotals[i],
    }));
    await tx.insert(purchaseLines).values(lineRows);

    await tx.insert(inventoryMovements).values(
      lineRows.map((line) => ({
        id: newId(),
        orgId: ctx.org.id,
        warehouseId: warehouse.id,
        productId: line.productId,
        date: input.date,
        type: "purchase" as const,
        quantity: line.quantity,
        unitCost: line.unitCost,
        refKind: "purchase_line",
        refId: line.id,
        createdBy: ctx.user.id,
      })),
    );

    return created;
  });
}

export async function listPurchases(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        purchase: purchases,
        supplierName: suppliers.name,
        lineCount: count(purchaseLines.id),
      })
      .from(purchases)
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .leftJoin(purchaseLines, eq(purchaseLines.purchaseId, purchases.id))
      .where(eq(purchases.orgId, ctx.org.id))
      .groupBy(purchases.id, suppliers.name)
      .orderBy(desc(purchases.date), desc(purchases.createdAt)),
  );
}

export async function getPurchase(ctx: OrgContext, purchaseId: string) {
  return withOrgRls(ctx.org.id, async (tx) => {
    const [row] = await tx
      .select({ purchase: purchases, supplierName: suppliers.name })
      .from(purchases)
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .where(and(eq(purchases.id, purchaseId), eq(purchases.orgId, ctx.org.id)))
      .limit(1);
    if (!row) return null;

    const lines = await tx
      .select({
        line: purchaseLines,
        productName: products.name,
        unit: products.unit,
      })
      .from(purchaseLines)
      .innerJoin(products, eq(purchaseLines.productId, products.id))
      .where(eq(purchaseLines.purchaseId, purchaseId))
      .orderBy(asc(purchaseLines.createdAt));

    return { ...row, lines };
  });
}

export async function deletePurchase(ctx: OrgContext, purchaseId: string) {
  assertCan(ctx, "purchase", "delete");
  await assertOrgFeature(ctx.org.id, "inventory");

  await withOrgRls(ctx.org.id, async (tx) => {
    const [purchase] = await tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.id, purchaseId), eq(purchases.orgId, ctx.org.id)))
      .limit(1);
    if (!purchase) throw new Error("purchase not found");

    const lines = await tx
      .select({ id: purchaseLines.id })
      .from(purchaseLines)
      .where(eq(purchaseLines.purchaseId, purchaseId));
    const lineIds = lines.map((line) => line.id);

    if (lineIds.length > 0) {
      await tx
        .delete(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.orgId, ctx.org.id),
            eq(inventoryMovements.refKind, "purchase_line"),
            inArray(inventoryMovements.refId, lineIds),
          ),
        );
    }
    // purchase_lines cascade on purchases.id delete.
    await tx
      .delete(purchases)
      .where(and(eq(purchases.id, purchaseId), eq(purchases.orgId, ctx.org.id)));
  });
}
