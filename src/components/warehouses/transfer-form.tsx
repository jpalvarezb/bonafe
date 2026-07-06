"use client";

import { useState } from "react";
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
import { createTransferAction } from "@/server/actions/transfers";

type WarehouseOption = { id: string; name: string };
type ProductOption = { id: string; name: string; unit: string };

type LineState = {
  key: number;
  productId: string;
  quantity: string;
};

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly warehouses: WarehouseOption[];
  readonly products: ProductOption[];
};

let keyCounter = 1;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransferForm({ locale, orgSlug, warehouses, products }: Props) {
  const t = useTranslations("warehouses");
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [toWarehouseId, setToWarehouseId] = useState(
    warehouses[1]?.id ?? warehouses[0]?.id ?? "",
  );
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  const payload = JSON.stringify({
    fromWarehouseId,
    toWarehouseId,
    date,
    notes: notes || undefined,
    lines: lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: line.quantity || "0",
      })),
  });

  const validLineCount = lines.filter(
    (line) => line.productId && line.quantity,
  ).length;
  const sameWarehouse =
    fromWarehouseId !== "" && fromWarehouseId === toWarehouseId;

  return (
    <form action={createTransferAction} className="flex flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="fromWarehouseId">{t("transfers.from")}</Label>
          <select
            id="fromWarehouseId"
            value={fromWarehouseId}
            onChange={(e) => setFromWarehouseId(e.target.value)}
            required
            className={selectClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="toWarehouseId">{t("transfers.to")}</Label>
          <select
            id="toWarehouseId"
            value={toWarehouseId}
            onChange={(e) => setToWarehouseId(e.target.value)}
            required
            className={selectClass}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">{t("transfers.date")}</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="notes">{t("transfers.notes")}</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {sameWarehouse && (
        <p className="text-sm text-destructive">
          {t("transfers.errors.sameWarehouse")}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("transfers.lines.title")}</CardTitle>
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
                },
              ])
            }
          >
            {t("transfers.lines.add")}
          </Button>
        </CardHeader>
        {lines.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">{t("transfers.lines.product")}</Label>
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
                  <Label className="text-xs">{t("transfers.lines.quantity")}</Label>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLines((ls) => ls.filter((_, i) => i !== index))
                  }
                >
                  {t("transfers.lines.remove")}
                </Button>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Button
        type="submit"
        disabled={
          !fromWarehouseId || !toWarehouseId || sameWarehouse || validLineCount === 0
        }
        className="self-start"
      >
        {t("transfers.save")}
      </Button>
    </form>
  );
}
