"use client";

import { useEffect } from "react";
import { clearDone, flushOutbox } from "@/lib/offline/outbox";

const FLUSH_INTERVAL_MS = 30_000;

/**
 * Mount-only client component: drives the offline outbox flush loop for an
 * org. Renders nothing — mount it once per org shell (e.g. in the org
 * layout header) so it stays alive across navigations within that org.
 */
export function SyncProvider({ orgSlug }: { orgSlug: string }) {
  useEffect(() => {
    let cancelled = false;

    async function runFlush() {
      const results = await flushOutbox(orgSlug);
      if (cancelled) return;
      if (results !== null) {
        await clearDone(orgSlug);
      }
    }

    void runFlush();

    function handleOnline() {
      void runFlush();
    }

    function handleVisibilityChange() {
      if (
        document.visibilityState === "visible" &&
        typeof navigator !== "undefined" &&
        navigator.onLine
      ) {
        void runFlush();
      }
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = setInterval(() => {
      void runFlush();
    }, FLUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [orgSlug]);

  return null;
}
