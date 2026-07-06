"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { inputLineTotal } from "@/lib/calc/costs";
import { createPurchaseAction } from "@/server/actions/purchases";

type SupplierOption = { id: string; name: string };
type ProductOption = { id: string; name: string; unit: string };

type LineState = {
  key: number;
  productId: string;
  quantity: string;
  unitCost: string;
};

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly suppliers: SupplierOption[];
  readonly products: ProductOption[];
  readonly currencyCode: string;
  readonly currencies: string[];
};

let keyCounter = 1;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PurchaseForm({
  locale,
  orgSlug,
  suppliers,
  products,
  currencyCode,
  currencies,
}: Props) {
  const t = useTranslations("purchases");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState(currencyCode);
  const [lines, setLines] = useState<LineState[]>([]);

  const lineTotals = useMemo(
    () =>
      lines.map((line) =>
        inputLineTotal({
          quantity: line.quantity || 0,
          unitCost: line.unitCost || 0,
        }),
      ),
    [lines],
  );

  const subtotal = useMemo(
    () =>
      lineTotals
        .reduce((sum, total) => sum.add(new Decimal(total)), new Decimal(0))
        .toFixed(4),
    [lineTotals],
  );

  const fmt = (value: string) =>
    `${Number(value).toLocaleString(locale, { maximumFractionDigits: 2 })} ${selectedCurrency}`;

  const payload = JSON.stringify({
    supplierId,
    date,
    invoiceNumber: invoiceNumber || undefined,
    currencyCode: selectedCurrency,
    notes: notes || undefined,
    lines: lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: line.quantity || "0",
        unitCost: line.unitCost || "0",
      })),
  });

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  const validLineCount = lines.filter((line) => line.productId).length;

  return (
    <form action={createPurchaseAction} className="flex flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="supplierId">{t("supplier")}</Label>
          <select
            id="supplierId"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
            className={selectClass}
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">{t("date")}</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invoiceNumber">{t("invoiceNumber")}</Label>
          <Input
            id="invoiceNumber"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currency">{t("currency")}</Label>
          <select
            id="currency"
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className={selectClass}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
                {code === currencyCode ? " *" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("lines.title")}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((ls) => [
                ...ls,
                {
                  key: keyCounter++,
                  productId: products[0]?.id ?? "",
                  quantity: "",
                  unitCost: "",
                },
              ])
            }
          >
            {t("lines.add")}
          </Button>
        </CardHeader>
        {lines.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("lines.product")}</Label>
                  <select
                    value={line.productId}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l, i) =>
                          i === index ? { ...l, productId: e.target.value } : l,
                        ),
                      )
                    }
                    className={`${selectClass} w-48`}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("lines.quantity")}</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l, i) =>
                          i === index ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                    className="w-28"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("lines.unitCost")}</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={line.unitCost}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((l, i) =>
                          i === index ? { ...l, unitCost: e.target.value } : l,
                        ),
                      )
                    }
                    className="w-28"
                  />
                </div>
                <span className="pb-2 text-sm text-muted-foreground">
                  = {fmt(lineTotals[index] ?? "0")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLines((ls) => ls.filter((_, i) => i !== index))
                  }
                >
                  {t("lines.remove")}
                </Button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <div className="flex items-center justify-end">
        <span className="text-lg font-semibold">
          {t("subtotal")}: {fmt(subtotal)}
        </span>
      </div>

      <Button
        type="submit"
        disabled={!supplierId || validLineCount === 0}
        className="self-start"
      >
        {t("save")}
      </Button>
    </form>
  );
}
