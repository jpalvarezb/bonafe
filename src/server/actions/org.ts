"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";

const createOrgSchema = z.object({
  name: z.string().min(2).max(120),
  country: z.string().max(80).optional(),
  baseCurrencyCode: z.string().length(3).default("USD"),
  locale: z.string(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export async function createOrganizationAction(formData: FormData) {
  const parsed = createOrgSchema.parse({
    name: formData.get("name"),
    country: formData.get("country") || undefined,
    baseCurrencyCode: formData.get("baseCurrencyCode") || "USD",
    locale: formData.get("locale"),
  });

  const requestHeaders = await headers();
  const base = slugify(parsed.name) || "org";

  // Retry with a numeric suffix if the slug is taken.
  let created = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    created = await auth.api
      .createOrganization({
        body: { name: parsed.name, slug },
        headers: requestHeaders,
      })
      .catch(() => null);
  }
  if (!created) {
    throw new Error("could not create organization");
  }

  await db
    .update(organization)
    .set({
      baseCurrencyCode: parsed.baseCurrencyCode.toUpperCase(),
      country: parsed.country ?? null,
    })
    .where(eq(organization.id, created.id));

  // The creator is auto-added as owner by createOrganization above, so a
  // full OrgContext can be resolved here to log the settings this action
  // just wrote (currency/country), same as any other settings update.
  const ctx = await requireOrgContext(parsed.locale, created.slug);
  await audit(ctx, "org.update", {
    entity: "organization",
    entityId: created.id,
    meta: {
      name: parsed.name,
      baseCurrencyCode: parsed.baseCurrencyCode.toUpperCase(),
    },
  });

  redirect(`/${parsed.locale}/o/${created.slug}/dashboard`);
}
