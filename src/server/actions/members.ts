"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { invitation, member } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import {
  assertCanAddMember,
  getOrgPlan,
  PlanLimitError,
} from "@/lib/plan-limits";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ORG_ROLES as [string, ...string[]]),
  path: z.string(),
  locale: z.string(),
  orgSlug: z.string(),
});

export async function inviteMemberAction(formData: FormData) {
  const parsed = inviteSchema.parse({
    email: formData.get("email"),
    role: formData.get("role"),
    path: formData.get("path"),
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });

  // Membership is verified before any org data is read — never trust a
  // client-supplied organization id.
  const ctx = await requireOrgContext(parsed.locale, parsed.orgSlug);
  const orgId = ctx.org.id;
  const planPagePath = `/${parsed.locale}/o/${parsed.orgSlug}/settings/plan?limit=maxUsers`;

  try {
    await assertCanAddMember(orgId);
  } catch (e) {
    if (e instanceof PlanLimitError) redirect(planPagePath);
    throw e;
  }

  // assertCanAddMember only checks active members; also count pending
  // invitations toward the seat limit so orgs can't bypass it by inviting
  // more people than seats allow while invitations are outstanding.
  const plan = await getOrgPlan(orgId);
  if (plan.limits.maxUsers != null) {
    const [{ value: memberCount }] = await db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, orgId));
    const [{ value: pendingCount }] = await db
      .select({ value: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, orgId),
          eq(invitation.status, "pending"),
        ),
      );
    if (memberCount + pendingCount >= plan.limits.maxUsers) {
      redirect(planPagePath);
    }
  }

  await auth.api.createInvitation({
    body: {
      email: parsed.email,
      role: parsed.role as "owner" | "admin" | "manager" | "field_supervisor",
      organizationId: orgId,
    },
    headers: await headers(),
  });

  revalidatePath(parsed.path);
}
