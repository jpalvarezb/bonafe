"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "@/i18n/navigation";
import { flushOutbox, outboxCounts } from "@/lib/offline/outbox";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SyncIssuesList } from "@/components/offline/sync-issues-list";

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}

export function SyncStatusBadge({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("offline");
  const online = useOnlineStatus();
  const counts = useLiveQuery(
    () => outboxCounts(orgSlug),
    [orgSlug],
    { pending: 0, rejected: 0 },
  );

  const { pending, rejected } = counts;

  if (!online) {
    if (pending === 0 && rejected === 0) return null;
    return (
      <StatusChip family="sync" state="offline">
        {t("badge.offline", { count: pending })}
      </StatusChip>
    );
  }

  if (pending > 0) {
    return (
      <button
        type="button"
        onClick={() => {
          void flushOutbox(orgSlug);
        }}
        className="cursor-pointer appearance-none rounded-[3px] border-0 bg-transparent p-0 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <StatusChip family="sync" state="pending">
          {t("badge.pending", { count: pending })}
        </StatusChip>
      </button>
    );
  }

  if (rejected > 0) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cursor-pointer appearance-none rounded-[3px] border-0 bg-transparent p-0 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <StatusChip family="sync" state="error">
              {t("badge.rejected", { count: rejected })}
            </StatusChip>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="border-b border-border px-4 py-3">
            <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {t("issues.title")}
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto p-4">
            <SyncIssuesList orgSlug={orgSlug} />
          </div>
          <div className="border-t border-border px-4 py-2 text-right">
            <Link
              href={`/o/${orgSlug}/sync-issues`}
              className="text-sm font-medium text-accent-link hover:underline"
            >
              {t("issues.viewAll")}
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return null;
}
