import Dexie, { type EntityTable } from "dexie";
import type { OutboxKind } from "./schemas";

export type OutboxEntry = {
  /** UUIDv7, generated at enqueue time. */
  id: string;
  orgSlug: string;
  kind: OutboxKind;
  /** Zod-validated payload (see schemas.ts); includes the row's own UUID. */
  payload: unknown;
  clientCreatedAt: string;
  status: "pending" | "syncing" | "done" | "rejected";
  attempts: number;
  lastError?: string;
};

export type RefCacheEntry = {
  /** e.g. "finca-demo:parcels" */
  key: string;
  orgSlug: string;
  pulledAt: string;
  rows: unknown[];
};

const dexie = new Dexie("agropeq-offline") as Dexie & {
  outbox: EntityTable<OutboxEntry, "id">;
  refCache: EntityTable<RefCacheEntry, "key">;
};

dexie.version(1).stores({
  outbox: "id, orgSlug, status, clientCreatedAt",
  refCache: "key, orgSlug",
});

export const offlineDb = dexie;
