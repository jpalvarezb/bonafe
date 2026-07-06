import { and, count, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { farms, invitation, member } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, PLAN_DEFINITIONS } from "@/lib/plan-limits";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PlanPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ limit?: string; feature?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("plan");

  const plan = await getOrgPlan(ctx.org.id);

  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(member)
    .where(eq(member.organizationId, ctx.org.id));
  const [{ value: pendingCount }] = await db
    .select({ value: count() })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, ctx.org.id),
        eq(invitation.status, "pending"),
      ),
    );
  const [{ value: farmCount }] = await db
    .select({ value: count() })
    .from(farms)
    .where(eq(farms.orgId, ctx.org.id));

  const limitParam =
    sp.limit === "maxUsers" || sp.limit === "maxFarms" ? sp.limit : undefined;
  const knownFeatures = new Set(
    PLAN_DEFINITIONS.flatMap((def) => def.limits.features),
  );
  const featureParam =
    sp.feature && knownFeatures.has(sp.feature) ? sp.feature : undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {limitParam && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t(`limitReached.${limitParam}`)}
        </div>
      )}

      {featureParam && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t("featureLocked", { feature: t(`features.${featureParam}`) })}
        </div>
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
                {!isCurrent && (
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
