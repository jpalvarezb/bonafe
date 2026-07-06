"use client";

import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/lib/offline/db";
import type { OutboxKind } from "@/lib/offline/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const KIND_KEYS: Record<OutboxKind, string> = {
  "activity.create": "activity_create",
  "monitoring.create": "monitoring_create",
};

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
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {t(`issues.kinds.${KIND_KEYS[entry.kind]}`)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {entry.clientCreatedAt}
                </span>
              </div>
              {entry.lastError && (
                <p className="truncate text-sm text-red-700 dark:text-red-400">
                  {entry.lastError}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => {
                void offlineDb.outbox.delete(entry.id);
              }}
            >
              {t("issues.discard")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
