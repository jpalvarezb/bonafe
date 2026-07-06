import Decimal from "decimal.js";

/**
 * Weighted-average inventory valuation over a signed movement ledger.
 * Inbound rows (quantity > 0) carry a unitCost and re-weight the average;
 * outbound rows (quantity < 0) are valued at the running average.
 * Pure — fold movements in date order; all money as strings.
 */

export type MovementLine = {
  quantity: string | number; // signed: >0 in, <0 out
  unitCost?: string | number | null; // required meaningfully only on inbound
};

export type StockState = {
  quantity: string;
  avgUnitCost: string;
  totalValue: string;
};

const d = (value: string | number | null | undefined) =>
  new Decimal(value ?? 0);

export const EMPTY_STOCK: StockState = {
  quantity: "0.0000",
  avgUnitCost: "0.0000",
  totalValue: "0.0000",
};

export function applyMovement(
  state: StockState,
  movement: MovementLine,
): StockState {
  const qty = d(state.quantity);
  const avg = d(state.avgUnitCost);
  const value = d(state.totalValue);
  const moveQty = d(movement.quantity);

  if (moveQty.isZero()) return state;

  if (moveQty.gt(0)) {
    // Inbound without an explicit cost (e.g. adjustment) enters at current avg.
    const unitCost =
      movement.unitCost == null || movement.unitCost === ""
        ? avg
        : d(movement.unitCost);
    const newQty = qty.add(moveQty);
    const newValue = value.add(moveQty.mul(unitCost));
    const newAvg = newQty.gt(0) ? newValue.div(newQty) : new Decimal(0);
    return {
      quantity: newQty.toFixed(4),
      avgUnitCost: newAvg.toFixed(4),
      totalValue: newValue.toFixed(4),
    };
  }

  // Outbound at the running average; average survives (even past zero, so a
  // late-arriving purchase entry can reconcile a temporarily negative stock).
  const newQty = qty.add(moveQty);
  const newValue = value.add(moveQty.mul(avg));
  return {
    quantity: newQty.toFixed(4),
    avgUnitCost: avg.toFixed(4),
    totalValue: newValue.toFixed(4),
  };
}

/** Fold a product/warehouse ledger (already sorted by date) into stock. */
export function computeStock(movements: MovementLine[]): StockState {
  return movements.reduce(applyMovement, EMPTY_STOCK);
}
