/**
 * Pure digest-assembly module for the daily org digest
 * (src/scripts/send-digest.ts). No DB access and no network here — every
 * function takes plain data and returns plain data, so it can be unit
 * tested with hand-computed fixtures (tests/unit/digest.test.ts).
 */
import Decimal from "decimal.js";
import { severityBand as bandFromSeverityScale } from "../severity";
import {
  renderDigestEmail as renderDigestEmailTemplate,
  type DigestTemplateSections,
} from "./templates";

/** Mirrors the org_subscriptions.status enum (src/lib/db/schema/billing.ts). */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type LowStockProduct = {
  productId: string;
  name: string;
  quantity: string;
  minStock: string | null;
};

export type MonitoringAlert = {
  id: string;
  severity: number;
  title: string;
};

export type DigestInput = {
  orgName: string;
  subscriptionStatus: SubscriptionStatus;
  lowStockProducts: LowStockProduct[];
  monitoringAlerts: MonitoringAlert[];
};

export type DigestSections = {
  subscriptionStatus: "past_due" | "canceled" | null;
  lowStockProducts: LowStockProduct[];
  monitoringAlerts: MonitoringAlert[];
};

/**
 * Binary high/normal banding for the digest, derived from the same
 * low/medium/high scale used everywhere else (src/lib/severity.ts) rather
 * than re-hardcoding the >=4 threshold here — "high" stays "high", anything
 * else (low or medium) collapses to "normal" for digest purposes.
 */
export function severityBand(severity: number): "high" | "normal" {
  return bandFromSeverityScale(severity) === "high" ? "high" : "normal";
}

/**
 * Exact semantics of the inventory page's low-stock check
 * (src/app/[locale]/(app)/o/[orgSlug]/inventory/page.tsx ~91-92): a row is
 * low only when minStock is set AND quantity is strictly below it. Decimal
 * comparison (not float) so boundary cases like 0.3 vs 0.3 never drift.
 */
export function filterLowStock(
  products: LowStockProduct[],
): LowStockProduct[] {
  return products.filter(
    (product) =>
      product.minStock != null &&
      new Decimal(product.quantity).lt(new Decimal(product.minStock)),
  );
}

/** Keeps only alerts banded "high" (severity 4 or 5 on the current scale). */
export function filterHighSeverityAlerts(
  alerts: MonitoringAlert[],
): MonitoringAlert[] {
  return alerts.filter((alert) => severityBand(alert.severity) === "high");
}

/** The subscription section only ever appears for past_due/canceled — an
 * active or trialing org has nothing to be warned about. */
export function assembleDigestSections(input: DigestInput): DigestSections {
  const subscriptionStatus =
    input.subscriptionStatus === "past_due" ||
    input.subscriptionStatus === "canceled"
      ? input.subscriptionStatus
      : null;

  return {
    subscriptionStatus,
    lowStockProducts: filterLowStock(input.lowStockProducts),
    monitoringAlerts: filterHighSeverityAlerts(input.monitoringAlerts),
  };
}

/** Nothing worth emailing today — the cron script skips the send entirely. */
export function shouldSendDigest(sections: DigestSections): boolean {
  return (
    sections.subscriptionStatus !== null ||
    sections.lowStockProducts.length > 0 ||
    sections.monitoringAlerts.length > 0
  );
}

export function renderDigestEmail(
  params: { orgName: string; sections: DigestSections },
  locale?: string | null,
) {
  const templateSections: DigestTemplateSections = params.sections;
  return renderDigestEmailTemplate({
    locale,
    orgName: params.orgName,
    sections: templateSections,
  });
}
