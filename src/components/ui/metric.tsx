import { cn } from "@/lib/utils";

type MetricSign = "negative" | "zero" | "positive";

/**
 * Determines the sign of a value without doing float math on it — money
 * values in this app travel as strings, and we only ever need to know
 * whether to color/prefix them, not their magnitude.
 */
function signOf(value: string | number): MetricSign {
  if (typeof value === "number") {
    if (value < 0) return "negative";
    if (value > 0) return "positive";
    return "zero";
  }
  const trimmed = value.trim();
  const digits = trimmed.replace(/^[+-]/, "").replace(/[^0-9]/g, "");
  if (digits.length === 0 || /^0+$/.test(digits)) return "zero";
  return trimmed.startsWith("-") ? "negative" : "positive";
}

export function Metric({
  value,
  signed = false,
  className,
}: {
  value: string | number;
  signed?: boolean;
  className?: string;
}) {
  const sign = signed ? signOf(value) : "zero";

  return (
    <span
      className={cn(
        "font-mono tabular",
        sign === "positive" && "text-fin-positive",
        sign === "negative" && "text-fin-negative",
        className,
      )}
    >
      {sign === "positive" && !String(value).trim().startsWith("+") ? "+" : ""}
      {value}
    </span>
  );
}
