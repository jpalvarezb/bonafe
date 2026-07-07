import { and, asc, count, desc, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { withOrgRls } from "@/lib/db/rls";
import { cropCycles, saleLines, sales } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import { inputLineTotal } from "@/lib/calc/costs";
import { latestRateToBaseInTx } from "@/server/services/exchange-rates";

export type SaleLineInput = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

export type SaleInput = {
  cropCycleId?: string | null;
  date: string;
  buyerName: string;
  invoiceNumber?: string | null;
  currencyCode?: string;
  notes?: string | null;
  lines: SaleLineInput[];
};

export async function createSale(ctx: OrgContext, input: SaleInput) {
  assertCan(ctx, "sale", "create");
  await assertOrgFeature(ctx.org.id, "sales");

  if (input.lines.length === 0) {
    throw new Error("sale must have at least one line");
  }

  return withOrgRls(ctx.org.id, async (tx) => {
    if (input.cropCycleId) {
      const [cycle] = await tx
        .select({ id: cropCycles.id })
        .from(cropCycles)
        .where(
          and(
            eq(cropCycles.id, input.cropCycleId),
            eq(cropCycles.orgId, ctx.org.id),
          ),
        )
        .limit(1);
      if (!cycle) throw new Error("crop cycle not found");
    }

    const currencyCode = input.currencyCode ?? ctx.org.baseCurrencyCode;
    const exchangeRate =
      currencyCode === ctx.org.baseCurrencyCode
        ? "1"
        : await latestRateToBaseInTx(tx, ctx, currencyCode, input.date);
    if (exchangeRate == null) {
      throw new Error("missing exchange rate for " + currencyCode);
    }

    // quantity × unitPrice is the same math as a purchase line's quantity ×
    // unitCost, so we reuse inputLineTotal rather than re-deriving it.
    const lineTotals = input.lines.map((line) =>
      inputLineTotal({ quantity: line.quantity, unitCost: line.unitPrice }),
    );
    const subtotal = lineTotals
      .reduce((sum, total) => sum.add(new Decimal(total)), new Decimal(0))
      .toFixed(4);
    // No tax in Phase 6 — total mirrors subtotal.
    const total = subtotal;

    const saleId = newId();

    const [created] = await tx
      .insert(sales)
      .values({
        id: saleId,
        orgId: ctx.org.id,
        cropCycleId: input.cropCycleId ?? null,
        date: input.date,
        buyerName: input.buyerName,
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
      saleId,
      description: line.description,
      quantity: String(line.quantity),
      unit: line.unit,
      unitPrice: String(line.unitPrice),
      total: lineTotals[i],
    }));
    await tx.insert(saleLines).values(lineRows);

    return created;
  });
}

export async function listSales(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        sale: sales,
        cycleName: cropCycles.name,
        lineCount: count(saleLines.id),
      })
      .from(sales)
      .leftJoin(cropCycles, eq(sales.cropCycleId, cropCycles.id))
      .leftJoin(saleLines, eq(saleLines.saleId, sales.id))
      .where(eq(sales.orgId, ctx.org.id))
      .groupBy(sales.id, cropCycles.name)
      .orderBy(desc(sales.date), desc(sales.createdAt)),
  );
}

export async function getSale(ctx: OrgContext, saleId: string) {
  return withOrgRls(ctx.org.id, async (tx) => {
    const [row] = await tx
      .select({ sale: sales, cycleName: cropCycles.name })
      .from(sales)
      .leftJoin(cropCycles, eq(sales.cropCycleId, cropCycles.id))
      .where(and(eq(sales.id, saleId), eq(sales.orgId, ctx.org.id)))
      .limit(1);
    if (!row) return null;

    const lines = await tx
      .select()
      .from(saleLines)
      .where(eq(saleLines.saleId, saleId))
      .orderBy(asc(saleLines.createdAt));

    return { ...row, lines };
  });
}

export async function deleteSale(ctx: OrgContext, saleId: string) {
  assertCan(ctx, "sale", "delete");
  await assertOrgFeature(ctx.org.id, "sales");

  await withOrgRls(ctx.org.id, async (tx) => {
    const [sale] = await tx
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.orgId, ctx.org.id)))
      .limit(1);
    if (!sale) throw new Error("sale not found");

    // sale_lines cascade on sales.id delete.
    await tx
      .delete(sales)
      .where(and(eq(sales.id, saleId), eq(sales.orgId, ctx.org.id)));
  });
}
