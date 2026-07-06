import { z } from "zod";

/**
 * Offline mutation payloads, shared by the client outbox and /api/sync.
 * Every payload carries the row id (client-generated UUIDv7) so server-side
 * inserts are idempotent under retries.
 */

const uuid = z.string().uuid();

export const activityCreatePayload = z.object({
  id: uuid,
  parcelId: uuid.optional(),
  cropCycleId: uuid.optional(),
  costCenterId: uuid.optional(),
  activityTypeId: uuid,
  date: z.string().min(10),
  description: z.string().optional(),
  otherCost: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  inputs: z.array(
    z.object({
      productId: uuid,
      quantity: z.string().min(1),
      unitCost: z.string().min(1),
    }),
  ),
  labor: z.array(
    z.object({
      workerName: z.string().optional(),
      workersCount: z.coerce.number().int().min(1),
      hours: z.string().optional(),
      rateType: z.enum(["daily", "hourly"]),
      rate: z.string().min(1),
    }),
  ),
});

export const monitoringCreatePayload = z.object({
  id: uuid,
  parcelId: uuid,
  cropCycleId: uuid.optional(),
  date: z.string().min(10),
  type: z.enum(["pest", "disease", "weed"]),
  agentName: z.string().min(1),
  severity: z.coerce.number().int().min(1).max(5),
  incidencePct: z.string().optional(),
  notes: z.string().optional(),
  actionsTaken: z.string().optional(),
});

export const OUTBOX_KINDS = {
  "activity.create": activityCreatePayload,
  "monitoring.create": monitoringCreatePayload,
} as const;

export type OutboxKind = keyof typeof OUTBOX_KINDS;

export type OutboxPayload<K extends OutboxKind> = z.infer<
  (typeof OUTBOX_KINDS)[K]
>;

export const syncItemSchema = z.object({
  /** Outbox entry id (also a UUIDv7); distinct from the row id in payload. */
  outboxId: uuid,
  kind: z.enum(Object.keys(OUTBOX_KINDS) as [OutboxKind, ...OutboxKind[]]),
  payload: z.unknown(),
  clientCreatedAt: z.string(),
});

export const syncRequestSchema = z.object({
  orgSlug: z.string().min(1),
  items: z.array(syncItemSchema).min(1).max(100),
});

export type SyncItemResult = {
  outboxId: string;
  status: "applied" | "duplicate" | "rejected";
  error?: string;
};
