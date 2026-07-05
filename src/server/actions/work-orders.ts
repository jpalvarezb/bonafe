"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createWorkOrder,
  deleteWorkOrder,
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

export async function createWorkOrderAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  await createWorkOrder(ctx, {
    title: z.string().min(1).parse(formData.get("title")),
    type: z.enum(["field", "machine"]).parse(formData.get("type")),
    parcelId: str(formData, "parcelId") ?? null,
    assignedToMemberId: str(formData, "assignedToMemberId") ?? null,
    scheduledDate: str(formData, "scheduledDate") ?? null,
    instructions: str(formData, "instructions") ?? null,
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
  await updateWorkOrderStatus(ctx, id, status);
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
  revalidatePath(`/${locale}/o/${orgSlug}/work-orders`);
}
