"use client";

import { useFormatter } from "next-intl";
import { Metric } from "@/components/ui/metric";

/** Currency-formatted <Metric>, shared by the KPI strip and the right rail
 * so both format money identically (no float math — Intl formats the
 * decimal string, Metric only inspects the resulting text for sign). */
export function MoneyValue({
  amount,
  currency,
  signed = false,
  className,
}: {
  readonly amount: string | number;
  readonly currency: string;
  readonly signed?: boolean;
  readonly className?: string;
}) {
  const format = useFormatter();
  const value = format.number(Number(amount), {
    style: "currency",
    currency,
  });
  return <Metric value={value} signed={signed} className={className} />;
}
