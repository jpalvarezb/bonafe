"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createWorkOrder,
  deleteWorkOrder,
  toggleChecklistItem,
  updateWorkOrderStatus,
} from "@/server/services/work-orders";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

const statusSchema = z.enum([
  "draft",
  "assigned",
  "in_progress",
  "done",
  "cancelled",
]);

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Splits the "one per line" checklist textarea into non-empty labels. */
function parseChecklistLines(formData: FormData): string[] {
  const raw = str(formData, "checklistText");
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);
}

export async function createWorkOrderAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const checklist = parseChecklistLines(formData).map((label) => ({
    id: crypto.randomUUID(),
    label,
    done: false,
  }));
  await createWorkOrder(ctx, {
    title: z.string().min(1).parse(formData.get("title")),
    type: z.enum(["field", "machine"]).parse(formData.get("type")),
    parcelId: str(formData, "parcelId") ?? null,
    machineId: str(formData, "machineId") ?? null,
    assignedToMemberId: str(formData, "assignedToMemberId") ?? null,
    scheduledDate: str(formData, "scheduledDate") ?? null,
    instructions: str(formData, "instructions") ?? null,
    checklist,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/work-orders`);
}

export async function updateWorkOrderStatusAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  const status = statusSchema.parse(formData.get("status"));
  try {
    const updated = await updateWorkOrderStatus(ctx, id, status);
    await audit(ctx, "work_order.status", {
      entity: "work_order",
      entityId: id,
      meta: { code: updated.code, to: status },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "checklist incomplete") {
      redirect(
        `/${locale}/o/${orgSlug}/work-orders?error=checklistIncomplete`,
      );
    }
    throw error;
  }
  revalidatePath(`/${locale}/o/${orgSlug}/work-orders`);
}

export async function toggleChecklistItemAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const workOrderId = z.string().uuid().parse(formData.get("workOrderId"));
  const itemId = z.string().min(1).parse(formData.get("itemId"));
  const done = z.enum(["true", "false"]).parse(formData.get("done")) === "true";
  await toggleChecklistItem(ctx, workOrderId, itemId, done);
  revalidatePath(`/${locale}/o/${orgSlug}/work-orders`);
}

export async function deleteWorkOrderAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteWorkOrder(ctx, id);
  await audit(ctx, "work_order.delete", {
    entity: "work_order",
    entityId: id,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/work-orders`);
}
