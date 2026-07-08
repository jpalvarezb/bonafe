import { and, count, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { withOrgRls } from "@/lib/db/rls";
import { farms, invitation, member, orgSubscriptions } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, PLAN_DEFINITIONS, type OrgPlan } from "@/lib/plan-limits";
import { isStripeConfigured } from "@/lib/stripe";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "@/server/actions/billing";
import { Notice } from "@/components/ui/notice";
import { StatusChip, type StatusFamily } from "@/components/ui/status-chip";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { cn } from "@/lib/utils";

// Same density/mono building blocks as the payroll/planning/work-orders
// screens — settings/plan is office-only in practice (billing management),
// but the tokens degrade gracefully if a field-mode user lands here.
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
// "bordered idiom" per the WP-F brief — same outline button used by
// payroll's generate/regenerate and planning's prev/next-month controls.
const BTN =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

// Billing status → StatusChip family/state. No family has a dedicated
// "billing" palette, so this reuses the closest existing semantics: active
// subscriptions read as "life:active" (green, same as an open payroll
// period), a trial reads as "life:planned" (neutral gray — not yet
// committed), and past_due borrows "sev:high" (red/orange) since it's the
// one state that needs to grab attention. canceled reuses "life:cancelled"
// (muted, matches the planning calendar's cancelled-activity tone).
const BILLING_STATUS_CHIP: Record<
  OrgPlan["status"],
  { family: StatusFamily; state: string }
> = {
  active: { family: "life", state: "active" },
  trialing: { family: "life", state: "planned" },
  past_due: { family: "sev", state: "high" },
  canceled: { family: "life", state: "cancelled" },
};

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
  const canManageBilling = can(ctx.role, "settings", "manage");

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
  const statusChip = BILLING_STATUS_CHIP[plan.status];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <SettingsTabs orgSlug={orgSlug} role={ctx.role} active="plan" />
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

      {/* Current plan: header row (name + billing-status chip), usage KPI
          strip, then the manage-billing action — one bordered block, same
          composition as the dashboard panel's cost-by-parcel card. */}
      <div className="border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className={MICRO_LABEL}>{t("current")}</span>
            <span className="text-[15px] font-semibold">{plan.planName}</span>
          </div>
          <StatusChip family={statusChip.family} state={statusChip.state}>
            {t(`status.${plan.status}`)}
          </StatusChip>
        </div>
        <div className="grid grid-cols-2 border-t border-border">
          <div className={cn(CELL, "border-r border-border")}>
            <div className={MICRO_LABEL}>{t("usage.users")}</div>
            <div className="tabular mt-0.5 font-mono text-[18px] font-semibold">
              {memberCount}
              <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                / {plan.limits.maxUsers ?? t("unlimited")}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
              {t("usage.pendingInvites", { count: pendingCount })}
            </div>
          </div>
          <div className={CELL}>
            <div className={MICRO_LABEL}>{t("usage.farms")}</div>
            <div className="tabular mt-0.5 font-mono text-[18px] font-semibold">
              {farmCount}
              <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                / {plan.limits.maxFarms ?? t("unlimited")}
              </span>
            </div>
          </div>
        </div>
        {stripeEnabled && hasStripeCustomer && canManageBilling && (
          <div className="border-t border-border px-3.5 py-2.5">
            <form action={createPortalSessionAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <button type="submit" className={BTN}>
                {tBilling("manageBilling")}
              </button>
            </form>
          </div>
        )}
        {stripeEnabled && hasStripeCustomer && !canManageBilling && (
          <p className="border-t border-border px-3.5 py-2.5 text-[length:var(--density-font-body)] text-muted-foreground">
            {tBilling("noPermission")}
          </p>
        )}
      </div>

      {/* Tier cards — current tier gets the life-active accent border +
          chip; feature lists get check marks (fin-positive token, same
          "included" green as a positive Metric). */}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_DEFINITIONS.map((def) => {
          const isCurrent = def.id === plan.planId;
          return (
            <div
              key={def.id}
              className={cn(
                "flex flex-col border",
                isCurrent
                  ? "border-life-active-border bg-life-active-bg/40"
                  : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
                <span className="text-[13px] font-semibold">{def.name}</span>
                {isCurrent && (
                  <StatusChip family="life" state="active">
                    {t("current")}
                  </StatusChip>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-3 px-3.5 py-3">
                <div>
                  <span className="tabular font-mono text-[22px] font-semibold">
                    ${Number(def.monthlyPriceUsd).toFixed(0)}
                  </span>
                  <span className="ml-1 font-mono text-[10.5px] text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5 font-mono text-[10.5px] text-muted-foreground">
                  <li>
                    {t("usage.users")}: {def.limits.maxUsers ?? t("unlimited")}
                  </li>
                  <li>
                    {t("usage.farms")}: {def.limits.maxFarms ?? t("unlimited")}
                  </li>
                </ul>
                <ul className="flex flex-col gap-1 text-[length:var(--density-font-body)]">
                  {def.limits.features.map((feature) => (
                    <li key={feature} className="flex items-baseline gap-1.5">
                      <span
                        aria-hidden
                        className="font-mono text-[11px] text-fin-positive"
                      >
                        ✓
                      </span>
                      {t(`features.${feature}`)}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-2">
                  {!isCurrent && stripeEnabled && canManageBilling && (
                    <form action={createCheckoutSessionAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="planId" value={def.id} />
                      <button type="submit" className={cn(BTN, "w-full")}>
                        {tBilling("changeTo", { plan: def.name })}
                      </button>
                    </form>
                  )}
                  {!isCurrent && stripeEnabled && !canManageBilling && (
                    <p className="text-[length:var(--density-font-label)] text-muted-foreground">
                      {tBilling("noPermission")}
                    </p>
                  )}
                  {!isCurrent && !stripeEnabled && (
                    <button disabled className={cn(BTN, "w-full")}>
                      {t("upgradeSoon")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
