import { z } from "zod";

/**
 * Offline mutation payloads, shared by the client outbox and /api/sync.
 * Every payload carries the row id (client-generated UUIDv7) so server-side
 * inserts are idempotent under retries.
 */

const uuid = z.string().uuid();

/** Quantities/costs/rates: non-negative decimal strings only — a tampered
 * payload must not be able to inject negative amounts (e.g. a negative input
 * quantity would flip into a positive stock movement). */
const positiveDecimal = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);
const optionalDecimal = z
  .union([positiveDecimal, z.literal("")])
  .optional();

/** Activity input quantity feeds a signed inventory movement 1:1
 * (createActivity negates it), and the DB rejects a movement of exactly
 * zero (inventory_movements_quantity_nonzero_check). Unlike other
 * non-negative decimals here, this one must be strictly greater than 0. */
const positiveNonZeroDecimal = positiveDecimal.refine(
  (value) => Number(value) > 0,
  { message: "must be greater than 0" },
);

/** monitoring_records_incidence_pct_check allows NULL or 0–100 inclusive;
 * positiveDecimal alone has no upper bound. */
const percentDecimal = z
  .union([
    positiveDecimal.refine((value) => Number(value) <= 100, {
      message: "must be between 0 and 100",
    }),
    z.literal(""),
  ])
  .optional();

export const activityCreatePayload = z.object({
  id: uuid,
  parcelId: uuid.optional(),
  cropCycleId: uuid.optional(),
  costCenterId: uuid.optional(),
  activityTypeId: uuid,
  date: z.string().min(10),
  description: z.string().optional(),
  otherCost: optionalDecimal,
  currencyCode: z.string().length(3).optional(),
  inputs: z.array(
    z.object({
      productId: uuid,
      quantity: positiveNonZeroDecimal,
      unitCost: positiveDecimal,
    }),
  ),
  labor: z.array(
    z.object({
      workerName: z.string().optional(),
      workersCount: z.coerce.number().int().min(1),
      hours: optionalDecimal,
      rateType: z.enum(["daily", "hourly"]),
      rate: positiveDecimal,
    }),
  ),
});

/** Device GPS fix, captured client-side (works fully offline — no network
 * round trip needed to read navigator.geolocation). Bounds mirror valid
 * WGS84 lat/lng ranges; the DB column is geometry(Point,4326). */
const geoLocation = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .optional();

export const monitoringCreatePayload = z.object({
  id: uuid,
  parcelId: uuid,
  cropCycleId: uuid.optional(),
  date: z.string().min(10),
  type: z.enum(["pest", "disease", "weed"]),
  agentName: z.string().min(1),
  severity: z.coerce.number().int().min(1).max(5),
  incidencePct: percentDecimal,
  notes: z.string().optional(),
  actionsTaken: z.string().optional(),
  location: geoLocation,
});

export const attendanceUpsertPayload = z.object({
  id: uuid,
  workerId: uuid,
  date: z.string().min(10),
  status: z.enum(["present", "half_day", "absent", "sick", "leave"]),
  /** Overtime hours beyond the day. Rates are snapshotted server-side. */
  hoursWorked: optionalDecimal,
  farmId: uuid.optional(),
  notes: z.string().optional(),
});

export const harvestCreatePayload = z.object({
  id: uuid,
  parcelId: uuid,
  cropCycleId: uuid.optional(),
  workerId: uuid.optional(),
  date: z.string().min(10),
  quantity: positiveDecimal,
  unit: z.string().min(1),
  qualityGrade: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * `code`/`title` are display-only — carried so pending chips and the sync
 * tray can show something human-readable before the server has responded.
 * The server MUST ignore both; the checklist and completion status are
 * derived entirely server-side from workOrderId.
 */
export const workOrderCompletePayload = z.object({
  workOrderId: uuid,
  checkedItemIds: z.array(z.string().min(1)).max(20),
  code: z.string().optional(),
  title: z.string().optional(),
});

export const OUTBOX_KINDS = {
  "activity.create": activityCreatePayload,
  "monitoring.create": monitoringCreatePayload,
  "attendance.upsert": attendanceUpsertPayload,
  "harvest.create": harvestCreatePayload,
  "workorder.complete": workOrderCompletePayload,
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
