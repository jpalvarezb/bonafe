/**
 * Pure CSV export helpers — accountant-grade money serialization.
 *
 * IMPORTANT: this module has ZERO DB/network imports. It only takes
 * already-fetched row objects and returns CSV strings. Money/quantity
 * columns must travel as the plain decimal strings Drizzle returns from
 * numeric columns — never Number(), toLocaleString(), or any locale
 * formatting, which would corrupt precision and break accountant tooling.
 */
import Papa from "papaparse";
import Decimal from "decimal.js";

const d = (value: string | number | null | undefined) =>
  new Decimal(value ?? 0);

/**
 * RFC-4180 field escaping: wrap in quotes (doubling embedded quotes) when
 * the field contains a comma, quote, or newline/CR. Null/undefined become
 * an empty string; numbers are stringified verbatim (no formatting).
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Joins already-typed row values into one RFC-4180 CSV line (no trailing newline). */
export function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Passes a decimal-string money/quantity column through verbatim — no
 * Number() coercion, no thousands separators, no locale formatting.
 * Null/undefined map to an empty string.
 */
export function toDecimalString(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Computes the base-currency amount for a row carrying an exchange-rate
 * snapshot: original × exchangeRate, fixed to 4dp via decimal.js (never
 * floating point). Returns '' when either input is missing so callers
 * don't fabricate a base amount for rows without an FX snapshot.
 */
export function toBaseCurrencyAmount(
  original: string | number | null | undefined,
  exchangeRate: string | number | null | undefined,
): string {
  if (original === null || original === undefined) return "";
  if (exchangeRate === null || exchangeRate === undefined) return "";
  return d(original).times(d(exchangeRate)).toFixed(4);
}

// ---------------------------------------------------------------------------
// Domain builders — one flat row per line item, mirroring the join shape
// each screen already renders. Callers fetch rows via the same service /
// RLS path as the screen and pass them in here unchanged.
// ---------------------------------------------------------------------------

export type PayrollExportRow = {
  periodName: string;
  periodStart: string;
  periodEnd: string;
  periodStatus: string;
  workerName: string;
  daysWorked: string | number | null;
  hoursWorked: string | number | null;
  baseAmount: string | number | null;
  overtimeAmount: string | number | null;
  pieceworkAmount: string | number | null;
  netAmount: string | number | null;
};

export function buildPayrollCsv(rows: PayrollExportRow[]): string {
  return Papa.unparse({
    fields: [
      "period_name",
      "period_start",
      "period_end",
      "period_status",
      "worker_name",
      "days_worked",
      "hours_worked",
      "base_amount",
      "overtime_amount",
      "piecework_amount",
      "net_amount",
    ],
    data: rows.map((r) => [
      r.periodName,
      r.periodStart,
      r.periodEnd,
      r.periodStatus,
      r.workerName,
      toDecimalString(r.daysWorked),
      toDecimalString(r.hoursWorked),
      toDecimalString(r.baseAmount),
      toDecimalString(r.overtimeAmount),
      toDecimalString(r.pieceworkAmount),
      toDecimalString(r.netAmount),
    ]),
  });
}

export type SalesExportRow = {
  date: string;
  buyerName: string | null;
  currencyCode: string;
  exchangeRate: string | number | null;
  cropCycleName: string | null;
  processingRunName: string | null;
  lineDescription: string | null;
  lineQuantity: string | number | null;
  lineUnit: string | null;
  lineUnitPrice: string | number | null;
  lineAmount: string | number | null;
};

export function buildSalesCsv(rows: SalesExportRow[]): string {
  return Papa.unparse({
    fields: [
      "date",
      "buyer",
      "currency_code",
      "exchange_rate",
      "crop_cycle",
      "processing_run",
      "line_description",
      "line_quantity",
      "line_unit",
      "line_unit_price",
      "line_amount",
      "line_amount_base",
    ],
    data: rows.map((r) => [
      r.date,
      r.buyerName ?? "",
      r.currencyCode,
      toDecimalString(r.exchangeRate),
      r.cropCycleName ?? "",
      r.processingRunName ?? "",
      r.lineDescription ?? "",
      toDecimalString(r.lineQuantity),
      r.lineUnit ?? "",
      toDecimalString(r.lineUnitPrice),
      toDecimalString(r.lineAmount),
      toBaseCurrencyAmount(r.lineAmount, r.exchangeRate),
    ]),
  });
}

export type HarvestExportRow = {
  date: string;
  parcelName: string | null;
  cropCycleName: string | null;
  workerName: string | null;
  quantity: string | number | null;
  unit: string | null;
  qualityGrade: string | null;
};

export function buildHarvestsCsv(rows: HarvestExportRow[]): string {
  return Papa.unparse({
    fields: [
      "date",
      "parcel",
      "crop_cycle",
      "worker",
      "quantity",
      "unit",
      "quality_grade",
    ],
    data: rows.map((r) => [
      r.date,
      r.parcelName ?? "",
      r.cropCycleName ?? "",
      r.workerName ?? "",
      toDecimalString(r.quantity),
      r.unit ?? "",
      r.qualityGrade ?? "",
    ]),
  });
}

export type InventoryExportRow = {
  productName: string;
  warehouseName: string;
  quantity: string | number | null;
  avgUnitCost: string | number | null;
  totalValue: string | number | null;
  minStock: string | number | null;
};

export function buildInventoryCsv(rows: InventoryExportRow[]): string {
  return Papa.unparse({
    fields: [
      "product",
      "warehouse",
      "quantity",
      "avg_unit_cost",
      "total_value",
      "min_stock",
    ],
    data: rows.map((r) => [
      r.productName,
      r.warehouseName,
      toDecimalString(r.quantity),
      toDecimalString(r.avgUnitCost),
      toDecimalString(r.totalValue),
      toDecimalString(r.minStock),
    ]),
  });
}

export type PurchaseExportRow = {
  date: string;
  supplierName: string | null;
  currencyCode: string;
  exchangeRate: string | number | null;
  productName: string | null;
  unit: string | null;
  quantity: string | number | null;
  unitCost: string | number | null;
  lineTotal: string | number | null;
};

export function buildPurchasesCsv(rows: PurchaseExportRow[]): string {
  return Papa.unparse({
    fields: [
      "date",
      "supplier",
      "currency_code",
      "exchange_rate",
      "product",
      "unit",
      "quantity",
      "unit_cost",
      "line_total",
      "line_total_base",
    ],
    data: rows.map((r) => [
      r.date,
      r.supplierName ?? "",
      r.currencyCode,
      toDecimalString(r.exchangeRate),
      r.productName ?? "",
      r.unit ?? "",
      toDecimalString(r.quantity),
      toDecimalString(r.unitCost),
      toDecimalString(r.lineTotal),
      toBaseCurrencyAmount(r.lineTotal, r.exchangeRate),
    ]),
  });
}
