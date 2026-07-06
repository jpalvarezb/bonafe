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
import { recordAdjustmentAction } from "@/server/actions/inventory";

type Option = { id: string; name: string };

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly products: Option[];
  readonly warehouses: Option[];
};

export function AdjustmentForm({
  locale,
  orgSlug,
  products,
  warehouses,
}: Props) {
  const t = useTranslations("inventory");
  const [direction, setDirection] = useState<"in" | "out">("in");

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adjustment.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={recordAdjustmentAction}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="productId">{t("adjustment.product")}</Label>
            <select
              id="productId"
              name="productId"
              required
              className={selectClass}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="warehouseId">{t("adjustment.warehouse")}</Label>
            <select
              id="warehouseId"
              name="warehouseId"
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
            <Label htmlFor="direction">{t("adjustment.direction")}</Label>
            <select
              id="direction"
              name="direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
              className={selectClass}
            >
              <option value="in">{t("adjustment.in")}</option>
              <option value="out">{t("adjustment.out")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="quantity">{t("adjustment.quantity")}</Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="0.0001"
              min="0"
              required
              className="w-28"
            />
          </div>
          {direction === "in" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="unitCost">{t("adjustment.unitCost")}</Label>
              <Input
                id="unitCost"
                name="unitCost"
                type="number"
                step="0.0001"
                min="0"
                className="w-28"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">{t("adjustment.notes")}</Label>
            <Input id="notes" name="notes" className="w-48" />
          </div>
          <Button type="submit">{t("adjustment.save")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
