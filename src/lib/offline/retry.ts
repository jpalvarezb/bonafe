import { ZodError } from "zod";

/**
 * Pure retry/review state machine for rejected offline outbox entries.
 *
 * A rejected sync item is never a dead end for a field worker: retrying
 * (or editing then retrying) reuses the SAME outbox row — same client
 * UUID, same idempotency key the server already saw — it never mints a
 * new id. Only `discardEntry` is a terminal, explicit action.
 *
 * This module has no Dexie/React/server imports on purpose: it is the pure
 * transition table that src/lib/offline/outbox.ts (persistence) and
 * src/components/offline/sync-issues-list.tsx (UI actions) both drive.
 */

/** Fixed reason-code union surfaced by the server on rejection (see
 * src/app/api/sync/route.ts) and localized client-side
 * (messages/*\/offline.json `issues.reasons.<code>`). */
export type RejectionReasonCode =
  | "validation"
  | "not_found"
  | "inactive"
  | "read_only"
  | "plan_limit"
  | "feature_not_in_plan"
  | "forbidden"
  | "unknown";

export type OutboxEntryStatus =
  | "pending"
  | "syncing"
  | "done"
  | "rejected"
  | "discarded";

export type RetryableEntry = {
  id: string;
  status: OutboxEntryStatus;
  payload: unknown;
  lastError?: string;
  reasonCode?: string;
};

/**
 * 'rejected' -> 'pending', same id, same payload, error/reason cleared.
 * A no-op on any other status: a pending/syncing/done/discarded entry
 * isn't awaiting review, so retrying it is not a valid transition.
 */
export function retryEntry<T extends RetryableEntry>(entry: T): T {
  if (entry.status !== "rejected") return entry;
  return {
    ...entry,
    status: "pending",
    lastError: undefined,
    reasonCode: undefined,
  };
}

/**
 * 'rejected' -> 'pending' with a replacement payload, same id. The outbox
 * entry id (not whatever id happens to be embedded in the client-supplied
 * payload) remains the single source of idempotency truth. A no-op on any
 * other status, mirroring retryEntry.
 */
export function editAndRetryEntry<T extends RetryableEntry>(
  entry: T,
  newPayload: unknown,
): T {
  if (entry.status !== "rejected") return entry;
  return {
    ...entry,
    status: "pending",
    payload: newPayload,
    lastError: undefined,
    reasonCode: undefined,
  };
}

/** Explicit, terminal discard. Once discarded, retry/editAndRetry are
 * no-ops (status is no longer 'rejected'). */
export function discardEntry<T extends RetryableEntry>(entry: T): T {
  return { ...entry, status: "discarded" };
}

/**
 * Maps a thrown error to a fixed, localizable reason code. Never changes
 * what a service throws or its audit() semantics — this only classifies
 * after the fact, for display and for the retry-queue UI.
 */
export function classifyRejection(error: unknown): RejectionReasonCode {
  if (error instanceof ZodError) return "validation";
  if (error instanceof Error) {
    if (error.name === "ReadOnlyOrgError") return "read_only";
    if (error.name === "PlanLimitError") return "plan_limit";
    if (error.name === "FeatureNotInPlanError") return "feature_not_in_plan";
    if (/not found/i.test(error.message)) return "not_found";
    if (/inactive/i.test(error.message)) return "inactive";
    if (/^forbidden/i.test(error.message)) return "forbidden";
  }
  return "unknown";
}
