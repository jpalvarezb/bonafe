import { and, count, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { withOrgRls } from "@/lib/db/rls";
import { farms, invitation, member, orgSubscriptions } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, PLAN_DEFINITIONS } from "@/lib/plan-limits";
import { isStripeConfigured } from "@/lib/stripe";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/server/actions/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

export default async function PlanPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{
    limit?: string;
    feature?: string;
    upgraded?: string;
  }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("plan");
  const tBilling = await getTranslations("billing");

  const plan = await getOrgPlan(ctx.org.id);
  const stripeEnabled = isStripeConfigured();

  // member/invitation carry no RLS (see src/lib/db/schema/tenancy.ts); farms
  // and org_subscriptions do — all four run under one withOrgRls so the GUC
  // is set for the RLS'd ones, in a single round trip.
  const { memberCount, pendingCount, farmCount, hasStripeCustomer } =
    await withOrgRls(ctx.org.id, async (tx) => {
      const [{ value: memberCount }] = await tx
        .select({ value: count() })
        .from(member)
        .where(eq(member.organizationId, ctx.org.id));
      const [{ value: pendingCount }] = await tx
        .select({ value: count() })
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, ctx.org.id),
            eq(invitation.status, "pending"),
          ),
        );
      const [{ value: farmCount }] = await tx
        .select({ value: count() })
        .from(farms)
        .where(eq(farms.orgId, ctx.org.id));
      const [subscriptionRow] = await tx
        .select({ stripeCustomerId: orgSubscriptions.stripeCustomerId })
        .from(orgSubscriptions)
        .where(eq(orgSubscriptions.orgId, ctx.org.id))
        .limit(1);
      return {
        memberCount,
        pendingCount,
        farmCount,
        hasStripeCustomer: Boolean(subscriptionRow?.stripeCustomerId),
      };
    });

  const limitParam =
    sp.limit === "maxUsers" || sp.limit === "maxFarms" ? sp.limit : undefined;
  const knownFeatures = new Set(
    PLAN_DEFINITIONS.flatMap((def) => def.limits.features),
  );
  const featureParam =
    sp.feature && knownFeatures.has(sp.feature) ? sp.feature : undefined;
  const showUpgraded = sp.upgraded === "1";
  const isReadOnly = plan.status === "past_due" || plan.status === "canceled";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {showUpgraded && (
        <Notice variant="success">
          <p>{tBilling("upgraded.title")}</p>
          <p className="font-normal">{tBilling("upgraded.description")}</p>
        </Notice>
      )}

      {isReadOnly && (
        <Notice variant="error">
          {t("readOnlyNotice", { status: t(`status.${plan.status}`) })}
        </Notice>
      )}

      {limitParam && (
        <Notice variant="warning">{t(`limitReached.${limitParam}`)}</Notice>
      )}

      {featureParam && (
        <Notice variant="warning">
          {t("featureLocked", { feature: t(`features.${featureParam}`) })}
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {t("current")}: {plan.planName}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t(`status.${plan.status}`)}
          </p>
          <p className="text-sm">
            {t("usage.users")}: {memberCount} /{" "}
            {plan.limits.maxUsers ?? t("unlimited")} ·{" "}
            {t("usage.pendingInvites", { count: pendingCount })}
          </p>
          <p className="text-sm">
            {t("usage.farms")}: {farmCount} /{" "}
            {plan.limits.maxFarms ?? t("unlimited")}
          </p>
          {stripeEnabled && hasStripeCustomer && (
            <form action={createPortalSessionAction} className="mt-2">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <Button type="submit" variant="outline" size="sm">
                {tBilling("manageBilling")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_DEFINITIONS.map((def) => {
          const isCurrent = def.id === plan.planId;
          return (
            <Card
              key={def.id}
              className={
                isCurrent ? "ring-2 ring-primary ring-offset-0" : undefined
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{def.name}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {t("current")}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p>
                  <span className="text-2xl font-semibold">
                    ${Number(def.monthlyPriceUsd).toFixed(0)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </p>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <li>
                    {t("usage.users")}: {def.limits.maxUsers ?? t("unlimited")}
                  </li>
                  <li>
                    {t("usage.farms")}: {def.limits.maxFarms ?? t("unlimited")}
                  </li>
                </ul>
                <ul className="flex flex-col gap-1 text-sm">
                  {def.limits.features.map((feature) => (
                    <li key={feature}>· {t(`features.${feature}`)}</li>
                  ))}
                </ul>
                {!isCurrent && stripeEnabled && (
                  <form action={createCheckoutSessionAction} className="mt-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="planId" value={def.id} />
                    <Button type="submit" variant="outline" className="w-full">
                      {tBilling("changeTo", { plan: def.name })}
                    </Button>
                  </form>
                )}
                {!isCurrent && !stripeEnabled && (
                  <Button disabled variant="outline" className="mt-2">
                    {t("upgradeSoon")}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
