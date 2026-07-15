"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { offlineDb } from "@/lib/offline/db";
import { HarvestForm, type HarvestPayload } from "@/components/harvests/harvest-form";
import {
  MonitoringForm,
  type MonitoringPayload,
} from "@/components/monitoring/monitoring-form";
import { ActivityForm, type ActivityPayload } from "@/components/activities/activity-form";
import {
  PieceworkEntryForm,
  type PieceworkEntryPayload,
} from "@/components/piecework/piecework-entry-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Option = { id: string; name: string };
type CycleOption = Option & { parcelId: string };
type RateOption = Option & { unit: string };

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  /** `?edit=` query param, read server-side and passed down — avoids a
   * client-only useSearchParams Suspense boundary for a single param. */
  readonly editId: string | null;
  readonly parcels: Option[];
  readonly cycles: CycleOption[];
  readonly workers: Option[];
  readonly rates: RateOption[];
  readonly activityTypes: Option[];
  readonly products: Option[];
  readonly costCenters: Option[];
  readonly unitCostByProduct: Record<string, string>;
  readonly currencyCode: string;
  readonly currencies: string[];
};

/**
 * The `?edit={outboxId}` per-item edit view — lives on the full /sync-issues
 * page (not the popover/rail embeds of SyncIssuesList) because it needs
 * server-fetched reference data (workers, rates, parcels…) that a
 * client-only popover doesn't have.
 *
 * Reads the target entry straight from Dexie (client-only storage): once
 * editOutboxEntry/retryOutboxEntry flips it out of 'rejected', this panel
 * unmounts itself on the next live-query tick — no separate "close" wiring
 * needed beyond the Cancel button below.
 */
export function SyncIssueEditPanel({
  locale,
  orgSlug,
  editId,
  parcels,
  cycles,
  workers,
  rates,
  activityTypes,
  products,
  costCenters,
  unitCostByProduct,
  currencyCode,
  currencies,
}: Props) {
  const t = useTranslations("offline");
  const router = useRouter();

  const entry = useLiveQuery(
    () => (editId ? offlineDb.outbox.get(editId) : undefined),
    [editId],
  );

  if (!editId) return null;
  // Entry not found (bad id) or no longer rejected (already retried/edited
  // successfully from elsewhere) — nothing to show.
  if (entry === undefined || entry.status !== "rejected") return null;

  function closeEdit() {
    router.push(`/o/${orgSlug}/sync-issues`);
  }

  let form: React.ReactNode;
  switch (entry.kind) {
    case "harvest.create":
      form = (
        <HarvestForm
          orgSlug={orgSlug}
          parcels={parcels}
          cycles={cycles}
          workers={workers}
          initialPayload={entry.payload as HarvestPayload}
          editingOutboxId={entry.id}
          onCancelEdit={closeEdit}
        />
      );
      break;
    case "monitoring.create":
      form = (
        <MonitoringForm
          locale={locale}
          orgSlug={orgSlug}
          parcels={parcels}
          cycles={cycles}
          initialPayload={entry.payload as MonitoringPayload}
          editingOutboxId={entry.id}
          onCancelEdit={closeEdit}
        />
      );
      break;
    case "activity.create":
      form = (
        <ActivityForm
          locale={locale}
          orgSlug={orgSlug}
          parcels={parcels}
          cycles={cycles}
          activityTypes={activityTypes}
          products={products}
          costCenters={costCenters}
          workers={workers}
          unitCostByProduct={unitCostByProduct}
          currencyCode={currencyCode}
          currencies={currencies}
          initialPayload={entry.payload as ActivityPayload}
          editingOutboxId={entry.id}
          onCancelEdit={closeEdit}
        />
      );
      break;
    case "piecework.create":
      form = (
        <PieceworkEntryForm
          orgSlug={orgSlug}
          workers={workers}
          rates={rates}
          cycles={cycles}
          initialPayload={entry.payload as PieceworkEntryPayload}
          editingOutboxId={entry.id}
          onCancelEdit={closeEdit}
        />
      );
      break;
    default:
      // attendance.upsert / workorder.complete: not edit-capable — the
      // Edit link in SyncIssuesList only appears for the kinds above.
      return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("issues.edit")}</CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
