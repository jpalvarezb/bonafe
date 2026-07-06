"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "@/i18n/navigation";
import { flushOutbox, outboxCounts } from "@/lib/offline/outbox";

const pillBase =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium";

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
      <span
        className={`${pillBase} bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100`}
      >
        {t("badge.offline", { count: pending })}
      </span>
    );
  }

  if (pending > 0) {
    return (
      <button
        type="button"
        onClick={() => {
          void flushOutbox(orgSlug);
        }}
        className={`${pillBase} bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800`}
      >
        {t("badge.pending", { count: pending })}
      </button>
    );
  }

  if (rejected > 0) {
    return (
      <Link
        href={`/o/${orgSlug}/sync-issues`}
        className={`${pillBase} bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800`}
      >
        {t("badge.rejected", { count: rejected })}
      </Link>
    );
  }

  return null;
}
