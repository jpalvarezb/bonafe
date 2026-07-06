import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { member, organization, orgSubscriptions } from "./db/schema";
import type { OrgRole } from "./auth/permissions";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type OrgContext = {
  user: { id: string; name: string; email: string };
  org: typeof organization.$inferSelect;
  role: OrgRole;
  memberId: string;
  /** Preloaded so assertCan can enforce read-only mode without extra queries. */
  subscriptionStatus: SubscriptionStatus;
};

/**
 * Resolves the current user's membership in the org named by the URL slug.
 * Redirects to login when unauthenticated and to onboarding when the user
 * is not a member of the org (never leaks whether the org exists).
 */
export async function requireOrgContext(
  locale: string,
  orgSlug: string,
): Promise<OrgContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/${locale}/login`);
  }

  const rows = await db
    .select({
      org: organization,
      membership: member,
      subscriptionStatus: orgSubscriptions.status,
    })
    .from(organization)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, session.user.id),
      ),
    )
    .leftJoin(orgSubscriptions, eq(orgSubscriptions.orgId, organization.id))
    .where(eq(organization.slug, orgSlug))
    .limit(1);

  const row = rows[0];
  if (!row) {
    redirect(`/${locale}/onboarding`);
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    org: row.org,
    role: row.membership.role as OrgRole,
    memberId: row.membership.id,
    // No subscription row = dev/demo Cosecha trial (see getOrgPlan).
    subscriptionStatus: (row.subscriptionStatus ??
      "trialing") as SubscriptionStatus,
  };
}

/**
 * Non-redirecting variant for API route handlers: returns null instead of
 * redirecting, so callers can respond 401/403 as JSON.
 */
export async function resolveOrgContext(
  orgSlug: string,
): Promise<OrgContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const rows = await db
    .select({
      org: organization,
      membership: member,
      subscriptionStatus: orgSubscriptions.status,
    })
    .from(organization)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, session.user.id),
      ),
    )
    .leftJoin(orgSubscriptions, eq(orgSubscriptions.orgId, organization.id))
    .where(eq(organization.slug, orgSlug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    org: row.org,
    role: row.membership.role as OrgRole,
    memberId: row.membership.id,
    // No subscription row = dev/demo Cosecha trial (see getOrgPlan).
    subscriptionStatus: (row.subscriptionStatus ??
      "trialing") as SubscriptionStatus,
  };
}

/** All orgs the user belongs to (for the org switcher / post-login redirect). */
export async function listUserOrgs(userId: string) {
  return db
    .select({ org: organization, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(organization.name);
}
