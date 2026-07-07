export type SeverityBand = "low" | "medium" | "high";

/**
 * Buckets a raw monitoring severity score into the low/medium/high bands
 * used by the `sev` status-chip family and the metric/choropleth ramp.
 * <=2 -> low, 3 -> medium, >=4 -> high.
 */
export function severityBand(severity: number): SeverityBand {
  if (severity >= 4) return "high";
  if (severity >= 3) return "medium";
  return "low";
}
