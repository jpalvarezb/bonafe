import Decimal from "decimal.js";

/**
 * Bridges inventory WAC valuation into activity input-line prefill: an
 * activity's input unit cost should default to the org's weighted-average
 * cost instead of being re-typed free text (which lets reported P&L drift
 * from inventory valuation). Pure — same computeStock/getStockByProduct-
 * shaped rows in, formatted string out.
 */

export type DefaultWarehouseStockRow = {
  productId: string;
  warehouseId: string;
  isDefaultWarehouse: boolean;
  avgUnitCost: string | number;
};

/**
 * Picks the default-warehouse WAC for a product out of a (possibly
 * multi-warehouse) set of stock rows. Returns undefined when the product has
 * no default-warehouse stock row at all — callers decide the fallback
 * (leave blank, derive from the DB directly, etc.).
 */
export function defaultUnitCostByProduct(
  rows: DefaultWarehouseStockRow[],
  productId: string,
): string | undefined {
  const row = rows.find(
    (r) => r.productId === productId && r.isDefaultWarehouse,
  );
  if (!row) return undefined;
  return new Decimal(row.avgUnitCost).toFixed(2);
}
