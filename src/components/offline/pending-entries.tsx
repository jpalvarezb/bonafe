"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { offlineDb } from "@/lib/offline/db";
import type { OutboxKind } from "@/lib/offline/schemas";

type Props = {
  readonly orgSlug: string;
  readonly kind: OutboxKind;
};

type PendingPayload = {
  date: string;
  agentName?: string;
};

export function PendingEntries({ orgSlug, kind }: Props) {
  const t = useTranslations("offline");

  const entries = useLiveQuery(
    () =>
      offlineDb.outbox
        .where("orgSlug")
        .equals(orgSlug)
        .and(
          (entry) =>
            entry.kind === kind &&
            (entry.status === "pending" || entry.status === "syncing"),
        )
        .sortBy("clientCreatedAt"),
    [orgSlug, kind],
  );

  if (!entries || entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => {
        const payload = entry.payload as PendingPayload;
        const description =
          kind === "monitoring.create" && payload.agentName
            ? `${payload.date} · ${payload.agentName}`
            : payload.date;
        return (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-100"
          >
            <span className="truncate">{description}</span>
            <span className="shrink-0 text-xs">{t("pendingNote")}</span>
          </div>
        );
      })}
    </div>
  );
}
