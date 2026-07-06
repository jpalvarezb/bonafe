"use client";

import { uuidv7 } from "uuidv7";
import { offlineDb, type OutboxEntry } from "./db";
import {
  OUTBOX_KINDS,
  type OutboxKind,
  type OutboxPayload,
  type SyncItemResult,
} from "./schemas";

const BATCH_SIZE = 25;

/**
 * Queue a mutation. ALL capture mutations go through here — even online,
 * where the immediate flush makes it feel synchronous. Returns the outbox id.
 */
export async function enqueue<K extends OutboxKind>(
  orgSlug: string,
  kind: K,
  payload: OutboxPayload<K>,
): Promise<string> {
  OUTBOX_KINDS[kind].parse(payload);
  const entry: OutboxEntry = {
    id: uuidv7(),
    orgSlug,
    kind,
    payload,
    clientCreatedAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await offlineDb.outbox.add(entry);
  return entry.id;
}

let flushing = false;

/**
 * Push pending entries to /api/sync in order. Safe to call repeatedly and
 * concurrently (single-flight). Returns the per-item results of the last
 * batch, or null when offline / nothing to do / already flushing.
 */
export async function flushOutbox(
  orgSlug: string,
): Promise<SyncItemResult[] | null> {
  if (flushing) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  flushing = true;
  try {
    // Recover entries stranded in "syncing" by a crash/reload mid-flush.
    // Safe because the server applies items idempotently by row UUID.
    await offlineDb.outbox
      .where("status")
      .equals("syncing")
      .and((entry) => entry.orgSlug === orgSlug)
      .modify({ status: "pending" });

    const pending = await offlineDb.outbox
      .where("status")
      .anyOf("pending")
      .and((entry) => entry.orgSlug === orgSlug)
      .sortBy("clientCreatedAt");
    if (pending.length === 0) return null;

    const batch = pending.slice(0, BATCH_SIZE);
    const ids = batch.map((entry) => entry.id);
    await offlineDb.outbox
      .where("id")
      .anyOf(ids)
      .modify({ status: "syncing" });

    let results: SyncItemResult[];
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          items: batch.map((entry) => ({
            outboxId: entry.id,
            kind: entry.kind,
            payload: entry.payload,
            clientCreatedAt: entry.clientCreatedAt,
          })),
        }),
      });
      if (!response.ok) throw new Error(`sync failed: ${response.status}`);
      const body = (await response.json()) as { results: SyncItemResult[] };
      results = body.results;
    } catch (error) {
      // Transport/HTTP failure (offline race, 5xx, expired session): always
      // retriable — entries go back to pending, never to "rejected", which is
      // reserved for per-item server rejects. attempts is observability only.
      await offlineDb.outbox
        .where("id")
        .anyOf(ids)
        .modify((entry) => {
          entry.status = "pending";
          entry.attempts += 1;
          entry.lastError = String(error);
        });
      return null;
    }

    for (const result of results) {
      if (result.status === "applied" || result.status === "duplicate") {
        await offlineDb.outbox.update(result.outboxId, { status: "done" });
      } else {
        await offlineDb.outbox.update(result.outboxId, {
          status: "rejected",
          lastError: result.error ?? "rejected",
        });
      }
    }
    return results;
  } finally {
    flushing = false;
  }
}

export async function outboxCounts(orgSlug: string) {
  const entries = await offlineDb.outbox
    .where("orgSlug")
    .equals(orgSlug)
    .toArray();
  return {
    pending: entries.filter(
      (e) => e.status === "pending" || e.status === "syncing",
    ).length,
    rejected: entries.filter((e) => e.status === "rejected").length,
  };
}

export async function clearDone(orgSlug: string) {
  await offlineDb.outbox
    .where("orgSlug")
    .equals(orgSlug)
    .and((entry) => entry.status === "done")
    .delete();
}
