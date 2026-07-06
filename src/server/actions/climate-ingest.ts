"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import { ingestRainfall } from "@/server/services/climate-ingest";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

const inputSchema = z.object({
  farmId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provider: z.enum(["open_meteo", "chirps"]),
});

// Maps service-thrown validation errors to translated keys under
// climate.ingest.errors — same ?error=<key> redirect-back-to-form pattern as
// warehouses/transfers/new (src/server/actions/transfers.ts).
const ERROR_KEYS: Record<string, string> = {
  "farm not found": "farmNotFound",
  "no parcels": "noParcels",
  "invalid range": "invalidRange",
  "range too long": "rangeTooLong",
  "provider unavailable": "providerUnavailable",
};

export async function ingestClimateAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);

  const input = inputSchema.parse({
    farmId: formData.get("farmId"),
    from: formData.get("from"),
    to: formData.get("to"),
    provider: formData.get("provider"),
  });

  const basePath = `/${locale}/o/${orgSlug}/climate?farm=${input.farmId}`;

  let result: Awaited<ReturnType<typeof ingestRainfall>>;
  try {
    result = await ingestRainfall(ctx, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const key = ERROR_KEYS[message] ?? "unknown";
    redirect(`${basePath}&error=${key}`);
  }

  revalidatePath(`/${locale}/o/${orgSlug}/climate`);
  redirect(`${basePath}&ingested=${result.count}&provider=${result.provider}`);
}
