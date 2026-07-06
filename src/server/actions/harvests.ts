"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import { deleteHarvest } from "@/server/services/harvests";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

export async function deleteHarvestAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteHarvest(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/harvests`);
}
