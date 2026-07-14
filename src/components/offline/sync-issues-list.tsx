"use client";

import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "@/i18n/navigation";
import { offlineDb } from "@/lib/offline/db";
import type { OutboxKind } from "@/lib/offline/schemas";
import { discardOutboxEntry, retryOutboxEntry } from "@/lib/offline/outbox";
import type { RejectionReasonCode } from "@/lib/offline/retry";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

const KIND_KEYS: Record<OutboxKind, string> = {
  "activity.create": "activity_create",
  "monitoring.create": "monitoring_create",
  "attendance.upsert": "attendance_upsert",
  "harvest.create": "harvest_create",
  "workorder.complete": "workorder_complete",
  "piecework.create": "piecework_create",
};

/** Kinds whose capture form supports an edit-then-retry flow (single-entity
 * forms with an editingOutboxId/initialPayload prop). attendance.upsert and
 * workorder.complete only get Retry-as-is + Discard. */
const EDITABLE_KINDS = new Set<OutboxKind>([
  "activity.create",
  "monitoring.create",
  "harvest.create",
  "piecework.create",
]);

const REASON_CODES: RejectionReasonCode[] = [
  "validation",
  "not_found",
  "inactive",
  "read_only",
  "plan_limit",
  "feature_not_in_plan",
  "forbidden",
  "unknown",
];

function isKnownReasonCode(value: unknown): value is RejectionReasonCode {
  return (
    typeof value === "string" &&
    (REASON_CODES as string[]).includes(value)
  );
}

export function SyncIssuesList({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("offline");
  const entries = useLiveQuery(
    () =>
      offlineDb.outbox
        .where("orgSlug")
        .equals(orgSlug)
        .and((entry) => entry.status === "rejected")
        .sortBy("clientCreatedAt"),
    [orgSlug],
    [],
  );

  if (entries.length === 0) {
    return <p className="text-muted-foreground">{t("issues.empty")}</p>;
  }

  return (
    <Card>
      <CardContent className="divide-y">
        {entries.map((entry) => {
          // Graceful fallback: a localized reason if the reason code is
          // recognized, else the raw server error, else a generic "unknown".
          const reason = isKnownReasonCode(entry.reasonCode)
            ? t(`issues.reasons.${entry.reasonCode}`)
            : (entry.lastError ?? t("issues.reasons.unknown"));

          return (
            <div key={entry.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t(`issues.kinds.${KIND_KEYS[entry.kind]}`)}
                    </span>
                    <StatusChip family="sync" state="error">
                      {t("issues.rejectedBadge")}
                    </StatusChip>
                    <span className="text-sm text-muted-foreground">
                      {entry.clientCreatedAt}
                    </span>
                  </div>
                  <p className="truncate text-sm text-sync-error-fg">
                    {reason}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void retryOutboxEntry(entry.id);
                  }}
                >
                  {t("issues.retry")}
                </Button>
                {EDITABLE_KINDS.has(entry.kind) && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/o/${orgSlug}/sync-issues?edit=${entry.id}`}>
                      {t("issues.edit")}
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm(t("issues.discardConfirm"))
                    ) {
                      return;
                    }
                    void discardOutboxEntry(entry.id);
                  }}
                >
                  {t("issues.discard")}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
