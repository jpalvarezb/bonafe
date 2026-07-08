import {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Bug,
  CalendarCheck,
  Wheat,
  MapPinned,
  RefreshCcw,
  CloudRain,
  CalendarDays,
  Users,
  HardHat,
  Wallet,
  Scissors,
  BarChart3,
  Boxes,
  ShoppingCart,
  Warehouse,
  Tractor,
  Receipt,
  Factory,
  Calculator,
  TrendingUp,
  Package,
  Sprout,
  FolderTree,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * `feature` names the plan-limits.ts feature (see PLAN_DEFINITIONS) that the
 * target page's own `hasFeature`/redirect check actually enforces — derived
 * by reading each page, not guessed (inherited from the Phase 0 audit).
 * Items with no gate omit it.
 */
export type NavItem = {
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly feature?: string;
};

/**
 * A labeled, collapsible group. `icon` is only rendered when the whole
 * section collapses into a single locked row (every item gated + locked) —
 * see sidebar-nav.tsx. Pure data by design: expand/collapse is session UI
 * state owned by sidebar-nav.tsx (default collapsed, auto-expands the
 * section holding the active route), not modeled here.
 */
export type NavSection = {
  readonly key: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly items: readonly NavItem[];
};

/** Pinned above every section, no section label. */
export const NAV_PINNED_TOP: NavItem = {
  key: "dashboard",
  href: "dashboard",
  icon: LayoutDashboard,
};

/** Pinned below every section, no section label. Active for ANY /settings/* path — see sidebar-nav.tsx. */
export const NAV_PINNED_BOTTOM: NavItem = {
  key: "settings",
  href: "settings/general",
  icon: Settings,
};

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    key: "campo",
    labelKey: "sections.campo",
    icon: ClipboardList,
    items: [
      { key: "activities", href: "activities", icon: ClipboardList },
      { key: "monitoring", href: "monitoring", icon: Bug },
      { key: "workOrders", href: "work-orders", icon: ClipboardCheck },
      {
        key: "attendance",
        href: "attendance",
        icon: CalendarCheck,
        feature: "labor",
      },
      { key: "harvests", href: "harvests", icon: Wheat, feature: "harvest" },
    ],
  },
  {
    key: "terreno",
    labelKey: "sections.terreno",
    icon: MapPinned,
    items: [
      { key: "farms", href: "farms", icon: MapPinned },
      { key: "cycles", href: "cycles", icon: RefreshCcw },
      { key: "climate", href: "climate", icon: CloudRain },
      {
        key: "planning",
        href: "planning",
        icon: CalendarDays,
        feature: "planning",
      },
    ],
  },
  {
    key: "gente",
    labelKey: "sections.gente",
    icon: Users,
    items: [
      { key: "workers", href: "workers", icon: HardHat, feature: "labor" },
      { key: "payroll", href: "payroll", icon: Wallet, feature: "payroll" },
      {
        key: "piecework",
        href: "piecework",
        icon: Scissors,
        feature: "payroll",
      },
      // Parks here until Phase 2 makes it a payroll tab — see task spec.
      {
        key: "laborReport",
        href: "reports/labor",
        icon: BarChart3,
        feature: "labor",
      },
    ],
  },
  {
    key: "inventoryAssets",
    labelKey: "sections.inventoryAssets",
    icon: Boxes,
    items: [
      {
        key: "purchases",
        href: "purchases",
        icon: ShoppingCart,
        feature: "inventory",
      },
      {
        key: "inventory",
        href: "inventory",
        icon: Boxes,
        feature: "inventory",
      },
      {
        key: "warehouses",
        href: "warehouses",
        icon: Warehouse,
        feature: "warehouses",
      },
      {
        key: "machinery",
        href: "machinery",
        icon: Tractor,
        feature: "machinery",
      },
    ],
  },
  {
    key: "commercial",
    labelKey: "sections.commercial",
    icon: Receipt,
    items: [
      {
        key: "processing",
        href: "processing",
        icon: Factory,
        feature: "sales",
      },
      { key: "sales", href: "sales", icon: Receipt, feature: "sales" },
      {
        key: "budgets",
        href: "budgets",
        icon: Calculator,
        feature: "budgets",
      },
      {
        key: "profitability",
        href: "reports/profitability",
        icon: TrendingUp,
        feature: "sales",
      },
    ],
  },
  {
    key: "catalog",
    labelKey: "sections.catalog",
    // Interim — absorbed into Settings in Phase 2. No gated items, so this
    // section never collapses (see sidebar-nav.tsx's collapse rule).
    icon: Package,
    items: [
      { key: "crops", href: "catalog/crops", icon: Sprout },
      { key: "products", href: "catalog/products", icon: Package },
      { key: "costCenters", href: "cost-centers", icon: FolderTree },
    ],
  },
];

/**
 * Rank of each plan tier's display name, low to high, mirroring
 * PLAN_DEFINITIONS order in plan-limits.ts (semilla < cultivo < cosecha).
 * Duplicated here (rather than importing plan-limits.ts, which touches the
 * db) so this stays a pure, client-safe data module — the nav-structure
 * test cross-checks feature keys against PLAN_DEFINITIONS directly instead.
 */
export const TIER_RANK: Readonly<Record<string, number>> = {
  Semilla: 0,
  Cultivo: 1,
  Cosecha: 2,
};

/** Lowest tier (by TIER_RANK) that unlocks any item in the list — used for a collapsed section's badge. */
export function lowestUnlockTier(
  items: readonly NavItem[],
  featureTiers: Readonly<Record<string, string>>,
): string | undefined {
  let best: string | undefined;
  for (const item of items) {
    if (!item.feature) continue;
    const tier = featureTiers[item.feature];
    if (!tier) continue;
    if (!best || (TIER_RANK[tier] ?? 0) < (TIER_RANK[best] ?? 0)) best = tier;
  }
  return best;
}

/** True when every item in the section is feature-gated AND locked for `features`. */
export function isSectionCollapsed(
  section: NavSection,
  features: readonly string[],
): boolean {
  const gated = section.items.filter((item) => item.feature != null);
  return (
    gated.length === section.items.length &&
    gated.every((item) => !features.includes(item.feature!))
  );
}
