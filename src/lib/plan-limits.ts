import { count, eq } from "drizzle-orm";
import { db } from "./db";
import { farms, member, orgSubscriptions, plans } from "./db/schema";

export type PlanLimits = {
  maxUsers: number | null; // null = unlimited
  maxFarms: number | null;
  features: string[];
};

export type PlanDefinition = {
  id: string;
  name: string;
  monthlyPriceUsd: string;
  limits: PlanLimits;
};

/** Source of truth for the three tiers; mirrored into the plans table by seed. */
export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: "semilla",
    name: "Semilla",
    monthlyPriceUsd: "100.00",
    limits: {
      maxUsers: 2,
      maxFarms: 1,
      features: ["core", "monitoring", "climate", "map"],
    },
  },
  {
    id: "cultivo",
    name: "Cultivo",
    monthlyPriceUsd: "200.00",
    limits: {
      maxUsers: 5,
      maxFarms: 2,
      features: [
        "core",
        "monitoring",
        "climate",
        "map",
        "harvest",
        "labor",
        "payroll",
        "inventory",
      ],
    },
  },
  {
    id: "cosecha",
    name: "Cosecha",
    monthlyPriceUsd: "350.00",
    limits: {
      maxUsers: null,
      maxFarms: null,
      features: [
        "core",
        "monitoring",
        "climate",
        "map",
        "harvest",
        "labor",
        "payroll",
        "inventory",
        "sales",
        "machinery",
        "budgets",
        "warehouses",
        "planning",
      ],
    },
  },
];

export type OrgPlan = {
  planId: string;
  planName: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  limits: PlanLimits;
};

/** Orgs without a subscription row are treated as a Cosecha trial (dev/demo). */
export async function getOrgPlan(orgId: string): Promise<OrgPlan> {
  const rows = await db
    .select({
      planId: orgSubscriptions.planId,
      status: orgSubscriptions.status,
      planName: plans.name,
      limits: plans.limits,
    })
    .from(orgSubscriptions)
    .innerJoin(plans, eq(orgSubscriptions.planId, plans.id))
    .where(eq(orgSubscriptions.orgId, orgId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    const cosecha = PLAN_DEFINITIONS.find((p) => p.id === "cosecha")!;
    return {
      planId: cosecha.id,
      planName: cosecha.name,
      status: "trialing",
      limits: cosecha.limits,
    };
  }
  return {
    planId: row.planId,
    planName: row.planName,
    status: row.status,
    limits: row.limits as PlanLimits,
  };
}

/**
 * Feature gate for Tier 2/3 modules ("labor", "payroll", "inventory",
 * "harvest", …). Pages redirect to settings/plan when this returns false.
 */
export function hasFeature(plan: OrgPlan, feature: string): boolean {
  return plan.limits.features.includes(feature);
}

export class FeatureNotInPlanError extends Error {
  readonly feature: string;
  constructor(feature: string) {
    super(`feature "${feature}" is not included in the org's plan`);
    this.name = "FeatureNotInPlanError";
    this.feature = feature;
  }
}

/**
 * Server-side entitlement check for mutations. Pages redirect via hasFeature;
 * services throw so direct POSTs / sync items can't bypass the page gate.
 */
export async function assertOrgFeature(
  orgId: string,
  feature: string,
): Promise<void> {
  const plan = await getOrgPlan(orgId);
  if (!hasFeature(plan, feature)) throw new FeatureNotInPlanError(feature);
}

export class PlanLimitError extends Error {
  readonly limit: "maxUsers" | "maxFarms";
  constructor(limit: "maxUsers" | "maxFarms", message: string) {
    super(message);
    this.name = "PlanLimitError";
    this.limit = limit;
  }
}

/** Throws PlanLimitError when adding one more member would exceed the plan. */
export async function assertCanAddMember(orgId: string): Promise<void> {
  const plan = await getOrgPlan(orgId);
  if (plan.limits.maxUsers == null) return;
  const [row] = await db
    .select({ value: count() })
    .from(member)
    .where(eq(member.organizationId, orgId));
  if (row.value >= plan.limits.maxUsers) {
    throw new PlanLimitError(
      "maxUsers",
      `plan ${plan.planId} allows ${plan.limits.maxUsers} users`,
    );
  }
}

/** Throws PlanLimitError when adding one more farm would exceed the plan. */
export async function assertCanAddFarm(orgId: string): Promise<void> {
  const plan = await getOrgPlan(orgId);
  if (plan.limits.maxFarms == null) return;
  const [row] = await db
    .select({ value: count() })
    .from(farms)
    .where(eq(farms.orgId, orgId));
  if (row.value >= plan.limits.maxFarms) {
    throw new PlanLimitError(
      "maxFarms",
      `plan ${plan.planId} allows ${plan.limits.maxFarms} farms`,
    );
  }
}
