import { describe, expect, it } from "vitest";
import {
  buildHarvestsCsv,
  buildInventoryCsv,
  buildPayrollCsv,
  buildPurchasesCsv,
  buildSalesCsv,
  escapeCsvField,
  toBaseCurrencyAmount,
  toCsvRow,
  toDecimalString,
} from "../../src/lib/export/csv";

describe("escapeCsvField", () => {
  it("leaves a plain field unquoted", () => {
    expect(escapeCsvField("simple")).toBe("simple");
  });

  it("quotes a field containing a comma", () => {
    expect(escapeCsvField("Managua, Nicaragua")).toBe(
      '"Managua, Nicaragua"',
    );
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(escapeCsvField('he said "hola"')).toBe('"he said ""hola"""');
  });

  it("quotes a field containing an embedded newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("quotes a field containing a carriage return", () => {
    expect(escapeCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("round-trips Spanish accents and eñe without mangling", () => {
    // Accents/ñ are not special CSV characters on their own — no quoting
    // needed unless combined with a comma/quote/newline.
    expect(escapeCsvField("Peña Niño")).toBe("Peña Niño");
  });

  it("handles a worker name combining commas, quotes and ñ (RFC-4180 stress case)", () => {
    const raw = 'José "Ñato" Pérez, Jr.';
    expect(escapeCsvField(raw)).toBe('"José ""Ñato"" Pérez, Jr."');
  });

  it("serializes null and undefined as empty string", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("serializes numbers verbatim as their string form", () => {
    expect(escapeCsvField(42)).toBe("42");
  });
});

describe("toCsvRow", () => {
  it("joins escaped fields with commas", () => {
    expect(toCsvRow(["a", "b,c", "d"])).toBe('a,"b,c",d');
  });

  it("serializes nullable fields in the row as empty string, preserving column position", () => {
    expect(toCsvRow(["a", null, "c", undefined])).toBe("a,,c,");
  });

  it("builds a full worker row with commas, quotes and ñ without breaking column count", () => {
    const row = toCsvRow([
      '2026-07-01',
      'José "Ñato" Pérez, Jr.',
      "10.00",
      null,
    ]);
    // Exactly 4 top-level comma-separated columns despite the embedded
    // comma inside the quoted worker-name field.
    expect(row).toBe('2026-07-01,"José ""Ñato"" Pérez, Jr.",10.00,');
  });
});

describe("toDecimalString", () => {
  it("passes a decimal string through verbatim with no locale/thousands formatting", () => {
    expect(toDecimalString("1234.5000")).toBe("1234.5000");
  });

  it("does not insert thousands separators for large amounts", () => {
    expect(toDecimalString("1000000.0000")).toBe("1000000.0000");
  });

  it("serializes null as empty string", () => {
    expect(toDecimalString(null)).toBe("");
  });

  it("serializes undefined as empty string", () => {
    expect(toDecimalString(undefined)).toBe("");
  });
});

describe("toBaseCurrencyAmount", () => {
  it("multiplies original amount by the exchange-rate snapshot via decimal.js, fixed to 4dp", () => {
    // Hand-computed: 1234.5000 * 36.62000000
    //   1234.5 * 36    = 44442
    //   1234.5 * 0.62  = 765.39
    //   total          = 45207.39
    expect(toBaseCurrencyAmount("1234.5000", "36.62000000")).toBe(
      "45207.3900",
    );
  });

  it("avoids float drift on a fractional rate", () => {
    // Hand-computed: 0.1 * 0.2 = 0.02 (not 0.020000000000000004)
    expect(toBaseCurrencyAmount("0.1000", "0.2")).toBe("0.0200");
  });

  it("returns empty string when the original amount is missing", () => {
    expect(toBaseCurrencyAmount(null, "36.62000000")).toBe("");
    expect(toBaseCurrencyAmount(undefined, "36.62000000")).toBe("");
  });

  it("returns empty string when there is no exchange-rate snapshot on the row", () => {
    expect(toBaseCurrencyAmount("100.0000", null)).toBe("");
    expect(toBaseCurrencyAmount("100.0000", undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Domain builders — every field's expected CSV output is hand-assembled
// below (Papa.unparse joins rows with \r\n and has no trailing terminator),
// so these tests exercise the actual build*Csv functions rather than the
// low-level helpers alone.
// ---------------------------------------------------------------------------

describe("buildPayrollCsv", () => {
  it("builds header fields + a worker row with RFC-4180 stress characters and verbatim money", () => {
    const csv = buildPayrollCsv([
      {
        periodName: "Quincena 1",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        periodStatus: "open",
        workerName: 'José "Ñato" Pérez, Jr.',
        daysWorked: "12.50",
        hoursWorked: "100.00",
        baseAmount: "1234.5000",
        overtimeAmount: "0.0000",
        pieceworkAmount: null,
        netAmount: "1234.5000",
      },
    ]);

    const header =
      "period_name,period_start,period_end,period_status,worker_name," +
      "days_worked,hours_worked,base_amount,overtime_amount," +
      "piecework_amount,net_amount";
    // worker_name contains a comma and embedded quotes -> quoted with
    // doubled internal quotes; piecework_amount is null -> empty field.
    const row =
      'Quincena 1,2026-07-01,2026-07-15,open,"José ""Ñato"" Pérez, Jr.",' +
      "12.50,100.00,1234.5000,0.0000,,1234.5000";
    expect(csv).toBe(`${header}\r\n${row}`);
  });
});

describe("buildSalesCsv", () => {
  it("builds one row per sale line with original + hand-computed base-currency amount", () => {
    const csv = buildSalesCsv([
      {
        date: "2026-07-01",
        buyerName: 'Cooperativa "La Unión", S.A.',
        currencyCode: "NIO",
        exchangeRate: "7.25000000",
        cropCycleName: "Ciclo Café 2026",
        processingRunName: null,
        lineDescription: "Café oro, primera calidad",
        lineQuantity: "500.0000",
        lineUnit: "qq",
        lineUnitPrice: "2.4690",
        lineAmount: "1234.5000",
      },
    ]);

    const header =
      "date,buyer,currency_code,exchange_rate,crop_cycle,processing_run," +
      "line_description,line_quantity,line_unit,line_unit_price," +
      "line_amount,line_amount_base";
    // Hand-computed: 1234.5000 * 7.25000000
    //   1234.5 * 7    = 8641.5
    //   1234.5 * 0.25 = 308.625
    //   total         = 8950.125 -> toFixed(4) = 8950.1250
    const row =
      '2026-07-01,"Cooperativa ""La Unión"", S.A.",NIO,7.25000000,' +
      'Ciclo Café 2026,,"Café oro, primera calidad",500.0000,qq,' +
      "2.4690,1234.5000,8950.1250";
    expect(csv).toBe(`${header}\r\n${row}`);
  });

  it("maps a null processing run / crop cycle to empty columns", () => {
    const csv = buildSalesCsv([
      {
        date: "2026-07-02",
        buyerName: "Beneficio Seco S.A.",
        currencyCode: "USD",
        exchangeRate: "1",
        cropCycleName: null,
        processingRunName: null,
        lineDescription: "Café pergamino",
        lineQuantity: "100.0000",
        lineUnit: "qq",
        lineUnitPrice: "50.0000",
        lineAmount: "5000.0000",
      },
    ]);
    const header =
      "date,buyer,currency_code,exchange_rate,crop_cycle,processing_run," +
      "line_description,line_quantity,line_unit,line_unit_price," +
      "line_amount,line_amount_base";
    const row =
      "2026-07-02,Beneficio Seco S.A.,USD,1,,,Café pergamino,100.0000,qq," +
      "50.0000,5000.0000,5000.0000";
    expect(csv).toBe(`${header}\r\n${row}`);
  });
});

describe("buildHarvestsCsv", () => {
  it("builds a full row and quotes the worker name's comma/quotes/ñ", () => {
    const csv = buildHarvestsCsv([
      {
        date: "2026-07-03",
        parcelName: "Parcela El Jícaro",
        cropCycleName: "Ciclo Café 2026",
        workerName: 'José "Ñato" Pérez, Jr.',
        quantity: "45.5000",
        unit: "qq",
        qualityGrade: "A",
      },
    ]);
    const header =
      "date,parcel,crop_cycle,worker,quantity,unit,quality_grade";
    const row =
      "2026-07-03,Parcela El Jícaro,Ciclo Café 2026," +
      '"José ""Ñato"" Pérez, Jr.",45.5000,qq,A';
    expect(csv).toBe(`${header}\r\n${row}`);
  });

  it("maps missing cycle/worker/quality-grade to empty columns", () => {
    const csv = buildHarvestsCsv([
      {
        date: "2026-07-04",
        parcelName: "Parcela Norte",
        cropCycleName: null,
        workerName: null,
        quantity: "10.0000",
        unit: "lata",
        qualityGrade: null,
      },
    ]);
    const header =
      "date,parcel,crop_cycle,worker,quantity,unit,quality_grade";
    const row = "2026-07-04,Parcela Norte,,,10.0000,lata,";
    expect(csv).toBe(`${header}\r\n${row}`);
  });
});

describe("buildInventoryCsv", () => {
  it("passes quantity/cost/value verbatim and quotes a product name containing a comma", () => {
    const csv = buildInventoryCsv([
      {
        productName: "Urea 46%, saco 50kg",
        warehouseName: "Bodega Central",
        quantity: "120.0000",
        avgUnitCost: "18.7500",
        totalValue: "2250.0000",
        minStock: null,
      },
    ]);
    const header = "product,warehouse,quantity,avg_unit_cost,total_value,min_stock";
    // 120.0000 * 18.7500 = 2250.0000 (already computed by the caller —
    // buildInventoryCsv only serializes it, never re-derives it).
    const row =
      '"Urea 46%, saco 50kg",Bodega Central,120.0000,18.7500,2250.0000,';
    expect(csv).toBe(`${header}\r\n${row}`);
  });
});

describe("buildPurchasesCsv", () => {
  it("builds one row per purchase line with original + hand-computed base-currency total", () => {
    const csv = buildPurchasesCsv([
      {
        date: "2026-07-05",
        supplierName: 'Distribuidora "El Agro", S.A.',
        currencyCode: "USD",
        exchangeRate: "1.00000000",
        productName: "Fertilizante NPK",
        unit: "saco",
        quantity: "10.0000",
        unitCost: "25.5000",
        lineTotal: "255.0000",
      },
    ]);
    const header =
      "date,supplier,currency_code,exchange_rate,product,unit,quantity," +
      "unit_cost,line_total,line_total_base";
    // Hand-computed: 255.0000 * 1.00000000 = 255.0000
    const row =
      '2026-07-05,"Distribuidora ""El Agro"", S.A.",USD,1.00000000,' +
      "Fertilizante NPK,saco,10.0000,25.5000,255.0000,255.0000";
    expect(csv).toBe(`${header}\r\n${row}`);
  });

  it("avoids float drift on a fractional exchange rate (0.1 * 0.2 = 0.02, not 0.020000000000000004)", () => {
    const csv = buildPurchasesCsv([
      {
        date: "2026-07-06",
        supplierName: "Agroquímicos del Norte",
        currencyCode: "HNL",
        exchangeRate: "0.2",
        productName: "Semilla certificada",
        unit: "qq",
        quantity: "1.0000",
        unitCost: "0.1000",
        lineTotal: "0.1000",
      },
    ]);
    const header =
      "date,supplier,currency_code,exchange_rate,product,unit,quantity," +
      "unit_cost,line_total,line_total_base";
    const row =
      "2026-07-06,Agroquímicos del Norte,HNL,0.2,Semilla certificada,qq," +
      "1.0000,0.1000,0.1000,0.0200";
    expect(csv).toBe(`${header}\r\n${row}`);
  });
});
