"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createSupplier,
  deleteSupplier,
  updateSupplier,
} from "@/server/services/suppliers";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createSupplierAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  await createSupplier(ctx, {
    name: z.string().min(1).parse(formData.get("name")),
    contactName: str(formData, "contactName") ?? null,
    phone: str(formData, "phone") ?? null,
    email: str(formData, "email") ?? null,
    taxId: str(formData, "taxId") ?? null,
    notes: str(formData, "notes") ?? null,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/purchases/suppliers`);
}

export async function updateSupplierAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await updateSupplier(ctx, id, {
    name: z.string().min(1).parse(formData.get("name")),
    contactName: str(formData, "contactName") ?? null,
    phone: str(formData, "phone") ?? null,
    email: str(formData, "email") ?? null,
    taxId: str(formData, "taxId") ?? null,
    notes: str(formData, "notes") ?? null,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/purchases/suppliers`);
  redirect(`/${locale}/o/${orgSlug}/purchases/suppliers`);
}

export async function deleteSupplierAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteSupplier(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/purchases/suppliers`);
  redirect(`/${locale}/o/${orgSlug}/purchases/suppliers`);
}
