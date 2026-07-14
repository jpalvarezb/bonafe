import { NextResponse } from "next/server";
import { resolveOrgContext } from "@/lib/tenancy";
import { cleanupExpiredWindows, rateLimit } from "@/lib/rate-limit";
import {
  activityCreatePayload,
  attendanceUpsertPayload,
  harvestCreatePayload,
  monitoringCreatePayload,
  syncRequestSchema,
  workOrderCompletePayload,
  type SyncItemResult,
} from "@/lib/offline/schemas";
import { createActivity } from "@/server/services/activities";
import { createMonitoringRecord } from "@/server/services/monitoring";
import { upsertAttendance } from "@/server/services/attendance";
import { createHarvest } from "@/server/services/harvests";
import { completeWorkOrder } from "@/server/services/work-orders";
import { audit } from "@/lib/audit";

/**
 * Offline outbox ingest. Items are applied in order; each is idempotent by
 * the row UUID inside its payload (services use ON CONFLICT DO NOTHING and
 * return the existing row on replay). A validation/permission failure rejects
 * only that item — the rest of the batch still applies.
 */
export async function POST(request: Request) {
  // Cheap pre-auth per-IP throttle: an unauthenticated flood would otherwise
  // pay for JSON parse + zod + a session lookup on every request.
  cleanupExpiredWindows();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const ipLimit = rateLimit(`sync-ip:${ip}`, { max: 120, windowMs: 60_000 });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const ctx = await resolveOrgContext(parsed.data.orgSlug);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Generous for legitimate offline flushes (batches of ≤100), hostile to
  // scripted hammering. 429 is transient client-side: entries stay pending.
  const limit = rateLimit(`sync:${ctx.user.id}`, {
    max: 30,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const results: SyncItemResult[] = [];

  for (const item of parsed.data.items) {
    try {
      if (item.kind === "activity.create") {
        const payload = activityCreatePayload.parse(item.payload);
        await createActivity(ctx, {
          id: payload.id,
          parcelId: payload.parcelId ?? null,
          cropCycleId: payload.cropCycleId ?? null,
          costCenterId: payload.costCenterId ?? null,
          activityTypeId: payload.activityTypeId,
          date: payload.date,
          description: payload.description ?? null,
          otherCost: payload.otherCost,
          currencyCode: payload.currencyCode,
          createdOffline: true,
          inputs: payload.inputs.map((line) => ({
            ...line,
            unitCost: line.unitCost || undefined,
          })),
          labor: payload.labor.map((line) => ({
            ...line,
            workerId: line.workerId || undefined,
            hours: line.hours || null,
            quantity: line.quantity || undefined,
          })),
        });
        // Replays return the existing row (ON CONFLICT DO NOTHING) — from the
        // client's perspective applied and duplicate resolve identically.
        results.push({ outboxId: item.outboxId, status: "applied" });
      } else if (item.kind === "attendance.upsert") {
        const payload = attendanceUpsertPayload.parse(item.payload);
        await upsertAttendance(ctx, {
          id: payload.id,
          workerId: payload.workerId,
          date: payload.date,
          status: payload.status,
          hoursWorked: payload.hoursWorked || null,
          farmId: payload.farmId ?? null,
          notes: payload.notes ?? null,
          createdOffline: true,
        });
        results.push({ outboxId: item.outboxId, status: "applied" });
      } else if (item.kind === "harvest.create") {
        const payload = harvestCreatePayload.parse(item.payload);
        await createHarvest(ctx, {
          id: payload.id,
          parcelId: payload.parcelId,
          cropCycleId: payload.cropCycleId ?? null,
          workerId: payload.workerId ?? null,
          date: payload.date,
          quantity: payload.quantity,
          unit: payload.unit,
          qualityGrade: payload.qualityGrade ?? null,
          notes: payload.notes ?? null,
          createdOffline: true,
        });
        results.push({ outboxId: item.outboxId, status: "applied" });
      } else if (item.kind === "workorder.complete") {
        const payload = workOrderCompletePayload.parse(item.payload);
        const { workOrder, transitioned } = await completeWorkOrder(ctx, {
          workOrderId: payload.workOrderId,
          checkedItemIds: payload.checkedItemIds,
        });
        // Only write the audit row on the transition itself — a replayed
        // completion (already "done") must not duplicate the audit entry.
        if (transitioned) {
          await audit(ctx, "work_order.status", {
            entity: "work_order",
            entityId: workOrder.id,
            meta: { code: workOrder.code, to: "done" },
          });
        }
        results.push({ outboxId: item.outboxId, status: "applied" });
      } else {
        const payload = monitoringCreatePayload.parse(item.payload);
        await createMonitoringRecord(ctx, {
          id: payload.id,
          parcelId: payload.parcelId,
          cropCycleId: payload.cropCycleId ?? null,
          date: payload.date,
          type: payload.type,
          agentName: payload.agentName,
          severity: payload.severity,
          incidencePct: payload.incidencePct ?? null,
          notes: payload.notes ?? null,
          actionsTaken: payload.actionsTaken ?? null,
          location: payload.location ?? null,
        });
        results.push({ outboxId: item.outboxId, status: "applied" });
      }
    } catch (error) {
      results.push({
        outboxId: item.outboxId,
        status: "rejected",
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}
