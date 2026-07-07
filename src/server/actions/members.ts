"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { invitation, member } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import {
  assertCanAddMember,
  getOrgPlan,
  PlanLimitError,
} from "@/lib/plan-limits";

// Never write the invited email in full to the append-only audit trail —
// only enough to recognize it later (first char + domain).
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0] ?? "*"}***@${domain}`;
}

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

  try {
    const created = await auth.api.createInvitation({
      body: {
        email: parsed.email,
        role: parsed.role as "owner" | "admin" | "manager" | "field_supervisor",
        organizationId: orgId,
      },
      headers: await headers(),
    });

    await audit(ctx, "member.invite", {
      entity: "invitation",
      entityId: created.id,
      meta: { role: parsed.role, email: maskEmail(parsed.email) },
    });
  } catch (err) {
    // Two paths land here for the same user-visible situation: Better Auth's
    // own pre-check (the common case — it looks up pending invites before
    // inserting and throws an APIError) and the raw DB unique violation on
    // invitation_org_email_pending_uq (the race-condition fallback the
    // partial unique index exists for, when two invites for the same email
    // are submitted concurrently and both pass that pre-check).
    const isBetterAuthDuplicate =
      err !== null &&
      typeof err === "object" &&
      "body" in err &&
      (err as { body?: { code?: string } }).body?.code ===
        "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION";
    const isDbDuplicate = isUniqueViolation(
      err,
      "invitation_org_email_pending_uq",
    );
    if (isBetterAuthDuplicate || isDbDuplicate) {
      redirect(`${parsed.path}?error=duplicatePending`);
    }
    throw err;
  }

  revalidatePath(parsed.path);
}
