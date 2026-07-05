/**
 * Deterministic demo seed. Idempotent: fixed UUIDs + onConflictDoNothing.
 * Grows with each phase — earlier click-throughs must keep working.
 * Run with: pnpm db:seed
 */
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import {
  activities,
  activityInputs,
  activityLabor,
  activityTypes,
  climateReadings,
  cropCycles,
  crops,
  cropVarieties,
  farms,
  member,
  monitoringRecords,
  organization,
  orgSubscriptions,
  parcels,
  plans,
  products,
  user,
} from "../lib/db/schema";
import { computeActivityTotals } from "../lib/calc/costs";
import { PLAN_DEFINITIONS } from "../lib/plan-limits";

const DEMO_PASSWORD = "demo1234";

const DEMO_USERS = [
  { name: "Olivia Dueña", email: "owner@demo.agropeq.io", role: "owner" },
  { name: "Andrés Admin", email: "admin@demo.agropeq.io", role: "admin" },
  {
    name: "Marta Gerente",
    email: "manager@demo.agropeq.io",
    role: "manager",
  },
  {
    name: "Samuel Supervisor",
    email: "supervisor@demo.agropeq.io",
    role: "field_supervisor",
  },
] as const;

// ---- fixed IDs (UUIDv7-shaped, hand-fixed for determinism) ----------------
const ID = {
  org: "org_finca_demo", // better-auth text id
  farmEsperanza: "01900000-0000-7000-8000-000000000101",
  farmVista: "01900000-0000-7000-8000-000000000102",
  parcelA: "01900000-0000-7000-8000-000000000201",
  parcelB: "01900000-0000-7000-8000-000000000202",
  parcelC: "01900000-0000-7000-8000-000000000203",
  parcelD: "01900000-0000-7000-8000-000000000204",
  cycleCafeA: "01900000-0000-7000-8000-000000000301",
  cycleMaizB: "01900000-0000-7000-8000-000000000302",
  cycleCafeClosed: "01900000-0000-7000-8000-000000000303",
} as const;

const GLOBAL_CROPS = [
  { id: "01900000-0000-7000-8000-00000000c001", name: "Café", sci: "Coffea arabica", days: 365 },
  { id: "01900000-0000-7000-8000-00000000c002", name: "Maíz", sci: "Zea mays", days: 120 },
  { id: "01900000-0000-7000-8000-00000000c003", name: "Frijol", sci: "Phaseolus vulgaris", days: 90 },
  { id: "01900000-0000-7000-8000-00000000c004", name: "Arroz", sci: "Oryza sativa", days: 150 },
  { id: "01900000-0000-7000-8000-00000000c005", name: "Aguacate", sci: "Persea americana", days: 365 },
  { id: "01900000-0000-7000-8000-00000000c006", name: "Caña de azúcar", sci: "Saccharum officinarum", days: 365 },
];

const COFFEE_VARIETIES = [
  { id: "01900000-0000-7000-8000-00000000e001", name: "Caturra" },
  { id: "01900000-0000-7000-8000-00000000e002", name: "Catuaí" },
  { id: "01900000-0000-7000-8000-00000000e003", name: "Bourbon" },
];

const GLOBAL_ACTIVITY_TYPES = [
  { id: "01900000-0000-7000-8000-00000000a001", name: "Siembra" },
  { id: "01900000-0000-7000-8000-00000000a002", name: "Fertilización" },
  { id: "01900000-0000-7000-8000-00000000a003", name: "Fumigación" },
  { id: "01900000-0000-7000-8000-00000000a004", name: "Chapoda / Deshierba" },
  { id: "01900000-0000-7000-8000-00000000a005", name: "Poda" },
  { id: "01900000-0000-7000-8000-00000000a006", name: "Riego" },
  { id: "01900000-0000-7000-8000-00000000a007", name: "Cosecha" },
  { id: "01900000-0000-7000-8000-00000000a008", name: "Mantenimiento" },
];

const DEMO_PRODUCTS = [
  { id: "01900000-0000-7000-8000-00000000f001", name: "Urea 46%", category: "fertilizer", unit: "qq", cost: 32 },
  { id: "01900000-0000-7000-8000-00000000f002", name: "Fórmula 18-46-0", category: "fertilizer", unit: "qq", cost: 38 },
  { id: "01900000-0000-7000-8000-00000000f003", name: "Glifosato 35.6 SL", category: "agrochemical", unit: "L", cost: 7.5 },
  { id: "01900000-0000-7000-8000-00000000f004", name: "Cyproconazol 10 SL", category: "agrochemical", unit: "L", cost: 22 },
  { id: "01900000-0000-7000-8000-00000000f005", name: "Semilla maíz H-INTA", category: "seed", unit: "kg", cost: 4.2 },
  { id: "01900000-0000-7000-8000-00000000f006", name: "Diésel", category: "fuel", unit: "L", cost: 1.15 },
  { id: "01900000-0000-7000-8000-00000000f007", name: "Machetes", category: "tool", unit: "unidad", cost: 8 },
  { id: "01900000-0000-7000-8000-00000000f008", name: "Foliar 20-20-20", category: "fertilizer", unit: "kg", cost: 5.5 },
] as const;

/** Small square-ish polygon around a center point (deterministic). */
function polygonAround(lng: number, lat: number, dLng: number, dLat: number) {
  return {
    type: "Polygon" as const,
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

/** Deterministic LCG so activity data is stable across runs. */
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function fixedActivityId(index: number): string {
  return `01900000-0000-7000-8000-0000000${(9000 + index).toString(16).padStart(5, "0")}`;
}

async function ensureUsers() {
  const users: Record<string, string> = {};
  for (const demoUser of DEMO_USERS) {
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, demoUser.email))
      .limit(1);
    if (existing.length > 0) {
      users[demoUser.email] = existing[0].id;
      console.log(`exists  ${demoUser.email}`);
      continue;
    }
    const result = await auth.api.signUpEmail({
      body: {
        name: demoUser.name,
        email: demoUser.email,
        password: DEMO_PASSWORD,
        locale: "es",
      },
    });
    users[demoUser.email] = result.user.id;
    console.log(`created ${demoUser.email} (password: ${DEMO_PASSWORD})`);
  }
  return users;
}

async function ensureOrg(users: Record<string, string>) {
  await db
    .insert(organization)
    .values({
      id: ID.org,
      name: "Finca Demo",
      slug: "finca-demo",
      baseCurrencyCode: "USD",
      country: "Nicaragua",
      timezone: "America/Managua",
    })
    .onConflictDoNothing({ target: organization.slug });

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, "finca-demo"))
    .limit(1);

  const existingMembers = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, org.id));
  const memberUserIds = new Set(existingMembers.map((row) => row.userId));

  for (const demoUser of DEMO_USERS) {
    const userId = users[demoUser.email];
    if (memberUserIds.has(userId)) continue;
    await db.insert(member).values({
      id: `mem_${demoUser.role}_demo`,
      organizationId: org.id,
      userId,
      role: demoUser.role,
    });
  }
  return org;
}

async function seedCatalog() {
  await db
    .insert(crops)
    .values(
      GLOBAL_CROPS.map((crop) => ({
        id: crop.id,
        orgId: null,
        name: crop.name,
        scientificName: crop.sci,
        defaultCycleDays: crop.days,
      })),
    )
    .onConflictDoNothing({ target: crops.id });

  await db
    .insert(cropVarieties)
    .values(
      COFFEE_VARIETIES.map((variety) => ({
        id: variety.id,
        cropId: GLOBAL_CROPS[0].id,
        orgId: null,
        name: variety.name,
      })),
    )
    .onConflictDoNothing({ target: cropVarieties.id });

  await db
    .insert(activityTypes)
    .values(
      GLOBAL_ACTIVITY_TYPES.map((type) => ({
        id: type.id,
        orgId: null,
        name: type.name,
        category: "field" as const,
      })),
    )
    .onConflictDoNothing({ target: activityTypes.id });
}

async function seedFarmData(orgId: string, ownerId: string) {
  await db
    .insert(farms)
    .values([
      {
        id: ID.farmEsperanza,
        orgId,
        name: "Finca La Esperanza",
        areaHa: "42.5000",
        notes: "Finca cafetalera en Matagalpa",
      },
      {
        id: ID.farmVista,
        orgId,
        name: "Finca Vista Hermosa",
        areaHa: "18.0000",
        notes: "Granos básicos",
      },
    ])
    .onConflictDoNothing({ target: farms.id });

  // Matagalpa coffee country (~ -85.92, 12.93)
  const parcelRows = [
    {
      id: ID.parcelA,
      farmId: ID.farmEsperanza,
      name: "Lote El Cedro",
      code: "A-01",
      boundary: polygonAround(-85.92, 12.93, 0.0022, 0.0018),
      soilType: "Franco arcilloso",
    },
    {
      id: ID.parcelB,
      farmId: ID.farmEsperanza,
      name: "Lote La Loma",
      code: "A-02",
      boundary: polygonAround(-85.914, 12.932, 0.0018, 0.0022),
      soilType: "Franco",
    },
    {
      id: ID.parcelC,
      farmId: ID.farmEsperanza,
      name: "Lote El Naranjal",
      code: "A-03",
      boundary: polygonAround(-85.917, 12.926, 0.0016, 0.0014),
      soilType: "Franco arenoso",
    },
    {
      id: ID.parcelD,
      farmId: ID.farmVista,
      name: "Lote El Llano",
      code: "B-01",
      boundary: polygonAround(-86.05, 12.85, 0.003, 0.002),
      soilType: "Aluvial",
    },
  ];

  for (const parcel of parcelRows) {
    await db
      .insert(parcels)
      .values({
        ...parcel,
        orgId,
        areaHa: null, // filled below via PostGIS
      })
      .onConflictDoNothing({ target: parcels.id });
  }

  // Compute areas for any parcel with a boundary and no area yet.
  await db.execute(
    `UPDATE parcels
     SET area_ha = (ST_Area(boundary::geography) / 10000.0)::numeric(12,4)
     WHERE boundary IS NOT NULL AND area_ha IS NULL`,
  );

  await db
    .insert(cropCycles)
    .values([
      {
        id: ID.cycleCafeA,
        orgId,
        farmId: ID.farmEsperanza,
        parcelId: ID.parcelA,
        cropId: GLOBAL_CROPS[0].id,
        varietyId: COFFEE_VARIETIES[0].id,
        name: "Café 2026-A · El Cedro",
        startDate: "2026-01-05",
        expectedEndDate: "2026-12-20",
        status: "active",
        plantedAreaHa: "4.8000",
        plantCount: 21000,
      },
      {
        id: ID.cycleMaizB,
        orgId,
        farmId: ID.farmVista,
        parcelId: ID.parcelD,
        cropId: GLOBAL_CROPS[1].id,
        name: "Maíz primera 2026 · El Llano",
        startDate: "2026-05-15",
        expectedEndDate: "2026-09-15",
        status: "active",
        plantedAreaHa: "6.0000",
      },
      {
        id: ID.cycleCafeClosed,
        orgId,
        farmId: ID.farmEsperanza,
        parcelId: ID.parcelB,
        cropId: GLOBAL_CROPS[0].id,
        varietyId: COFFEE_VARIETIES[1].id,
        name: "Café 2025 · La Loma",
        startDate: "2025-01-10",
        endDate: "2025-12-15",
        status: "closed",
        plantedAreaHa: "3.9000",
      },
    ])
    .onConflictDoNothing({ target: cropCycles.id });

  await db
    .insert(products)
    .values(
      DEMO_PRODUCTS.map((product) => ({
        id: product.id,
        orgId,
        name: product.name,
        category: product.category,
        unit: product.unit,
      })),
    )
    .onConflictDoNothing({ target: products.id });

  await seedActivities(orgId, ownerId);
}

async function seedActivities(orgId: string, ownerId: string) {
  const rng = makeRng(42);
  const targets = [
    { parcelId: ID.parcelA, farmId: ID.farmEsperanza, cycleId: ID.cycleCafeA, weight: 0.5 },
    { parcelId: ID.parcelB, farmId: ID.farmEsperanza, cycleId: null, weight: 0.2 },
    { parcelId: ID.parcelD, farmId: ID.farmVista, cycleId: ID.cycleMaizB, weight: 0.3 },
  ];

  const ACTIVITY_COUNT = 36;
  for (let i = 0; i < ACTIVITY_COUNT; i++) {
    const activityId = fixedActivityId(i);
    const existing = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);
    if (existing.length > 0) continue;

    const roll = rng();
    const target =
      roll < targets[0].weight
        ? targets[0]
        : roll < targets[0].weight + targets[1].weight
          ? targets[1]
          : targets[2];
    const type =
      GLOBAL_ACTIVITY_TYPES[Math.floor(rng() * GLOBAL_ACTIVITY_TYPES.length)];
    const month = 1 + Math.floor(rng() * 6); // Jan..Jun 2026
    const day = 1 + Math.floor(rng() * 28);
    const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const useInput = rng() > 0.4;
    const product =
      DEMO_PRODUCTS[Math.floor(rng() * DEMO_PRODUCTS.length)];
    const quantity = (1 + Math.floor(rng() * 10)).toFixed(2);
    const inputs = useInput
      ? [{ productId: product.id, quantity, unitCost: product.cost.toFixed(2) }]
      : [];

    const workers = 1 + Math.floor(rng() * 8);
    const labor = [
      {
        workersCount: workers,
        rateType: "daily" as const,
        rate: (8 + Math.floor(rng() * 5)).toFixed(2),
        hours: null,
      },
    ];

    const totals = computeActivityTotals({ inputs, labor });

    await db.transaction(async (tx) => {
      await tx.insert(activities).values({
        id: activityId,
        orgId,
        farmId: target.farmId,
        parcelId: target.parcelId,
        cropCycleId: target.cycleId,
        activityTypeId: type.id,
        date,
        description: null,
        laborCost: totals.laborCost,
        inputCost: totals.inputCost,
        machineCost: "0",
        otherCost: "0",
        totalCost: totals.totalCost,
        currencyCode: "USD",
        createdBy: ownerId,
      });
      if (inputs.length > 0) {
        await tx.insert(activityInputs).values(
          inputs.map((line, index) => ({
            id: activityId.replace("-0000000", `-${index}00000a`),
            orgId,
            activityId,
            productId: line.productId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            total: totals.inputTotals[index],
          })),
        );
      }
      await tx.insert(activityLabor).values(
        labor.map((line, index) => ({
          id: activityId.replace("-0000000", `-${index}00000b`),
          orgId,
          activityId,
          workerName: "Cuadrilla",
          workersCount: line.workersCount,
          hours: null,
          rateType: line.rateType,
          rate: line.rate,
          amount: totals.laborAmounts[index],
        })),
      );
    });
  }
  console.log(`activities ensured (${ACTIVITY_COUNT})`);
}

// ---- Phase 2 additions ----------------------------------------------------

async function seedPlans() {
  for (const plan of PLAN_DEFINITIONS) {
    await db
      .insert(plans)
      .values({
        id: plan.id,
        name: plan.name,
        monthlyPriceUsd: plan.monthlyPriceUsd,
        limits: plan.limits,
      })
      .onConflictDoNothing({ target: plans.id });
  }
  console.log("plans ensured (semilla/cultivo/cosecha)");
}

/** Demo org runs a Cosecha trial so no module is gated during development. */
async function seedDemoSubscription(orgId: string) {
  await db
    .insert(orgSubscriptions)
    .values({
      id: "01900000-0000-7000-8000-00000000d001",
      orgId,
      planId: "cosecha",
      status: "trialing",
    })
    .onConflictDoNothing({ target: orgSubscriptions.orgId });
}

/**
 * Second org on the Semilla plan: proves tenant isolation and lets us
 * exercise plan limits (1 farm / 2 users) without touching the demo org.
 */
async function seedNeighborOrg() {
  const email = "vecino@demo.agropeq.io";
  let userId: string;
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing.length > 0) {
    userId = existing[0].id;
  } else {
    const result = await auth.api.signUpEmail({
      body: {
        name: "Víctor Vecino",
        email,
        password: DEMO_PASSWORD,
        locale: "es",
      },
    });
    userId = result.user.id;
    console.log(`created ${email} (password: ${DEMO_PASSWORD})`);
  }

  await db
    .insert(organization)
    .values({
      id: "org_vecino_sa",
      name: "Vecino SA",
      slug: "vecino-sa",
      baseCurrencyCode: "NIO",
      country: "Nicaragua",
      timezone: "America/Managua",
    })
    .onConflictDoNothing({ target: organization.slug });

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, "vecino-sa"))
    .limit(1);

  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, org.id));
  if (!members.some((m) => m.userId === userId)) {
    await db.insert(member).values({
      id: "mem_owner_vecino",
      organizationId: org.id,
      userId,
      role: "owner",
    });
  }

  await db
    .insert(orgSubscriptions)
    .values({
      id: "01900000-0000-7000-8000-00000000d002",
      orgId: org.id,
      planId: "semilla",
      status: "active",
    })
    .onConflictDoNothing({ target: orgSubscriptions.orgId });

  await db
    .insert(farms)
    .values({
      id: "01900000-0000-7000-8000-000000000103",
      orgId: org.id,
      name: "Finca El Vecino",
      areaHa: "12.0000",
    })
    .onConflictDoNothing({ target: farms.id });
}

async function seedMonitoring(orgId: string, createdBy: string) {
  const rows = [
    {
      id: "01900000-0000-7000-8000-00000000ee01",
      parcelId: ID.parcelA,
      cropCycleId: ID.cycleCafeA,
      date: "2026-05-12",
      type: "pest" as const,
      agentName: "Broca del café",
      severity: 3,
      incidencePct: "12.50",
      notes: "Focos en el sector norte",
      actionsTaken: "Trampas con alcohol instaladas",
    },
    {
      id: "01900000-0000-7000-8000-00000000ee02",
      parcelId: ID.parcelA,
      cropCycleId: ID.cycleCafeA,
      date: "2026-06-02",
      type: "disease" as const,
      agentName: "Roya (Hemileia vastatrix)",
      severity: 4,
      incidencePct: "22.00",
      notes: "Avance rápido tras lluvias",
      actionsTaken: "Aplicación de cyproconazol programada",
    },
    {
      id: "01900000-0000-7000-8000-00000000ee03",
      parcelId: ID.parcelD,
      cropCycleId: ID.cycleMaizB,
      date: "2026-06-10",
      type: "weed" as const,
      agentName: "Coyolillo",
      severity: 2,
      incidencePct: "8.00",
      notes: null,
      actionsTaken: "Chapoda manual",
    },
  ];
  for (const row of rows) {
    await db
      .insert(monitoringRecords)
      .values({ ...row, orgId, createdBy })
      .onConflictDoNothing({ target: monitoringRecords.id });
  }
  console.log("monitoring records ensured (3)");
}

async function seedClimate(orgId: string) {
  const rng = makeRng(7);
  const start = new Date("2026-04-01T00:00:00Z");
  const values: Array<typeof climateReadings.$inferInsert> = [];
  for (let day = 0; day < 90; day++) {
    const date = new Date(start.getTime() + day * 86400000)
      .toISOString()
      .slice(0, 10);
    // Wet season ramps up May–June
    const wetFactor = Math.min(1, day / 45);
    const rain = rng() < 0.35 + 0.3 * wetFactor ? rng() * 45 * wetFactor : 0;
    values.push({
      id: `01900000-0000-7000-8000-0000000c${(1000 + day).toString().padStart(4, "0")}`,
      orgId,
      farmId: ID.farmEsperanza,
      date,
      source: "manual",
      rainfallMm: rain.toFixed(2),
      tempMinC: (17 + rng() * 3).toFixed(2),
      tempMaxC: (26 + rng() * 5).toFixed(2),
      humidityPct: (65 + rng() * 25).toFixed(2),
    });
  }
  for (const value of values) {
    await db
      .insert(climateReadings)
      .values(value)
      .onConflictDoNothing({ target: climateReadings.id });
  }
  console.log("climate readings ensured (90 days)");
}

async function main() {
  const users = await ensureUsers();
  await seedCatalog();
  await seedPlans();
  const org = await ensureOrg(users);
  await seedDemoSubscription(org.id);
  await seedFarmData(org.id, users["owner@demo.agropeq.io"]);
  await seedMonitoring(org.id, users["owner@demo.agropeq.io"]);
  await seedClimate(org.id);
  await seedNeighborOrg();
  console.log("seed complete: orgs finca-demo + vecino-sa ready");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
