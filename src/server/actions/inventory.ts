"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import { recordAdjustment } from "@/server/services/inventory";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function recordAdjustmentAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  await recordAdjustment(ctx, {
    productId: z.string().uuid().parse(formData.get("productId")),
    warehouseId: z.string().uuid().parse(formData.get("warehouseId")),
    direction: z.enum(["in", "out"]).parse(formData.get("direction")),
    quantity: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,8})?$/)
      .parse(formData.get("quantity")),
    unitCost: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,8})?$/)
      .optional()
      .parse(str(formData, "unitCost")) ?? null,
    notes: str(formData, "notes") ?? null,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/inventory`);
}
