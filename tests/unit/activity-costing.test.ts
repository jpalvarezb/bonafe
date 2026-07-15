import { describe, expect, it } from "vitest";
import { computeStock } from "../../src/lib/calc/inventory";
import { defaultUnitCostByProduct } from "../../src/lib/calc/activity-costing";

/**
 * Pure WAC-default helper: given computeStock-shaped rows (as produced by
 * getStockByProduct, one row per warehouse/product), derive the unit-cost
 * prefill for an activity's input line from the default warehouse's
 * weighted-average cost — instead of the current free-text re-typed value.
 */
describe("defaultUnitCostByProduct", () => {
  it("derives the default-warehouse WAC for a product with purchases", () => {
    // 20 @ 32.00 then 10 @ 35.00 => (640 + 350) / 30 = 33.00
    const defaultWarehouseStock = computeStock([
      { quantity: "20", unitCost: "32.00" },
      { quantity: "10", unitCost: "35.00" },
    ]);

    const rows = [
      {
        productId: "p1",
        warehouseId: "w-default",
        isDefaultWarehouse: true,
        avgUnitCost: defaultWarehouseStock.avgUnitCost,
      },
    ];

    expect(defaultUnitCostByProduct(rows, "p1")).toBe("33.00");
  });

  it("returns undefined for a product with no stock rows at all", () => {
    const rows = [
      {
        productId: "p1",
        warehouseId: "w-default",
        isDefaultWarehouse: true,
        avgUnitCost: "33.0000",
      },
    ];

    expect(defaultUnitCostByProduct(rows, "p-unknown")).toBeUndefined();
  });

  it("picks the default-warehouse row when the product has stock in multiple warehouses", () => {
    const defaultWarehouseStock = computeStock([
      { quantity: "20", unitCost: "32.00" },
      { quantity: "10", unitCost: "35.00" },
    ]);
    const secondaryWarehouseStock = computeStock([
      { quantity: "5", unitCost: "50.00" },
    ]);

    const rows = [
      {
        productId: "p1",
        warehouseId: "w-secondary",
        isDefaultWarehouse: false,
        avgUnitCost: secondaryWarehouseStock.avgUnitCost,
      },
      {
        productId: "p1",
        warehouseId: "w-default",
        isDefaultWarehouse: true,
        avgUnitCost: defaultWarehouseStock.avgUnitCost,
      },
    ];

    // Must ignore the secondary-warehouse 50.00 average and use the
    // default warehouse's 33.00, regardless of row order.
    expect(defaultUnitCostByProduct(rows, "p1")).toBe("33.00");
  });
});
