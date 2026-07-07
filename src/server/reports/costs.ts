import { and, count, desc, eq, sql, sum } from "drizzle-orm";
import { withOrgRls } from "@/lib/db/rls";
import {
  activities,
  activityTypes,
  cropCycles,
  farms,
  parcels,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";

// Every cost sum below multiplies total_cost by the activity's exchange-rate
// snapshot, so report totals are always expressed in the org's base currency
// (activities.exchange_rate converts an activity's own currency to base).
export async function dashboardSummary(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, async (tx) => {
    const orgFilter = eq(activities.orgId, ctx.org.id);

    const [totals] = await tx
      .select({
        totalCost: sum(sql`(${activities.totalCost} * ${activities.exchangeRate})`),
      })
      .from(activities)
      .where(orgFilter);

    const [farmCount] = await tx
      .select({ value: count() })
      .from(farms)
      .where(eq(farms.orgId, ctx.org.id));

    const [parcelCount] = await tx
      .select({ value: count() })
      .from(parcels)
      .where(eq(parcels.orgId, ctx.org.id));

    const [activeCycles] = await tx
      .select({ value: count() })
      .from(cropCycles)
      .where(
        and(eq(cropCycles.orgId, ctx.org.id), eq(cropCycles.status, "active")),
      );

    return {
      totalCost: totals.totalCost ?? "0",
      farms: farmCount.value,
      parcels: parcelCount.value,
      activeCycles: activeCycles.value,
    };
  });
}

export async function costByParcel(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        parcelId: parcels.id,
        parcelName: parcels.name,
        farmName: farms.name,
        areaHa: parcels.areaHa,
        totalCost: sum(sql`(${activities.totalCost} * ${activities.exchangeRate})`),
      })
      .from(activities)
      .innerJoin(parcels, eq(activities.parcelId, parcels.id))
      .innerJoin(farms, eq(parcels.farmId, farms.id))
      .where(eq(activities.orgId, ctx.org.id))
      .groupBy(parcels.id, parcels.name, farms.name, parcels.areaHa)
      .orderBy(
        desc(sum(sql`(${activities.totalCost} * ${activities.exchangeRate})`)),
      ),
  );
}

export async function costByCategory(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        typeName: activityTypes.name,
        totalCost: sum(sql`(${activities.totalCost} * ${activities.exchangeRate})`),
      })
      .from(activities)
      .innerJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(eq(activities.orgId, ctx.org.id))
      .groupBy(activityTypes.name)
      .orderBy(
        desc(sum(sql`(${activities.totalCost} * ${activities.exchangeRate})`)),
      ),
  );
}

export async function costByMonth(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) => {
    const month = sql<string>`to_char(date_trunc('month', ${activities.date}::date), 'YYYY-MM')`;
    return tx
      .select({
        month,
        totalCost: sum(sql`(${activities.totalCost} * ${activities.exchangeRate})`),
      })
      .from(activities)
      .where(eq(activities.orgId, ctx.org.id))
      .groupBy(month)
      .orderBy(month);
  });
}
