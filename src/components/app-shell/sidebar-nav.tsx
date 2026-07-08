"use client";

import {
  LayoutDashboard,
  MapPinned,
  Map as MapIcon,
  RefreshCcw,
  ClipboardList,
  ClipboardCheck,
  Bug,
  CloudRain,
  FolderTree,
  Package,
  Sprout,
  Users,
  Settings,
  Wheat,
  HardHat,
  CalendarCheck,
  Wallet,
  ShoppingCart,
  Boxes,
  BarChart3,
  Warehouse,
  Tractor,
  CalendarDays,
  Calculator,
  Factory,
  Receipt,
  Scissors,
  TrendingUp,
  Lock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/lib/auth/permissions";

/**
 * `feature` names the plan-limits.ts feature (see PLAN_DEFINITIONS) that
 * the target page's own `hasFeature`/redirect check actually enforces —
 * derived by reading each page, not guessed. Items with no gate omit it.
 * `minRole` is reserved for Phase 1: the Phase 0 audit found no nav target
 * whose *page* itself redirects on role (only inline canManage-style UI
 * gating inside otherwise-open pages), so no item sets it today.
 */
type NavItem = {
  key: string;
  href: string;
  icon: typeof LayoutDashboard;
  feature?: string;
  minRole?: OrgRole;
};

const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "dashboard", icon: LayoutDashboard },
  { key: "farms", href: "farms", icon: MapPinned },
  { key: "map", href: "map", icon: MapIcon },
  { key: "cycles", href: "cycles", icon: RefreshCcw },
  { key: "activities", href: "activities", icon: ClipboardList },
  { key: "workOrders", href: "work-orders", icon: ClipboardCheck },
  { key: "monitoring", href: "monitoring", icon: Bug },
  { key: "climate", href: "climate", icon: CloudRain },
  { key: "harvests", href: "harvests", icon: Wheat, feature: "harvest" },
  { key: "processing", href: "processing", icon: Factory, feature: "sales" },
  { key: "sales", href: "sales", icon: Receipt, feature: "sales" },
  { key: "workers", href: "workers", icon: HardHat, feature: "labor" },
  {
    key: "attendance",
    href: "attendance",
    icon: CalendarCheck,
    feature: "labor",
  },
  { key: "payroll", href: "payroll", icon: Wallet, feature: "payroll" },
  { key: "piecework", href: "piecework", icon: Scissors, feature: "payroll" },
  {
    key: "purchases",
    href: "purchases",
    icon: ShoppingCart,
    feature: "inventory",
  },
  { key: "inventory", href: "inventory", icon: Boxes, feature: "inventory" },
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
  {
    key: "planning",
    href: "planning",
    icon: CalendarDays,
    feature: "planning",
  },
  { key: "budgets", href: "budgets", icon: Calculator, feature: "budgets" },
  {
    key: "laborReport",
    href: "reports/labor",
    icon: BarChart3,
    feature: "labor",
  },
  {
    key: "profitability",
    href: "reports/profitability",
    icon: TrendingUp,
    feature: "sales",
  },
  { key: "costCenters", href: "cost-centers", icon: FolderTree },
  { key: "products", href: "catalog/products", icon: Package },
  { key: "crops", href: "catalog/crops", icon: Sprout },
  { key: "members", href: "settings/members", icon: Users },
  { key: "settings", href: "settings/general", icon: Settings },
];

export function SidebarNav(props: {
  readonly orgSlug: string;
  // Threaded through today (unused below) so Phase 1 can gate on
  // `NavItem.minRole` without another prop-drilling pass — see NavItem
  // comment for why no item sets minRole yet.
  readonly role: OrgRole;
  readonly features: readonly string[];
  readonly featureTiers: Readonly<Record<string, string>>;
}) {
  const { orgSlug, features, featureTiers } = props;
  const t = useTranslations("common.nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map(({ key, href, icon: Icon, feature }) => {
        const fullHref = `/o/${orgSlug}/${href}`;
        const active = pathname.startsWith(fullHref);
        const locked = feature != null && !features.includes(feature);
        const tier = locked ? featureTiers[feature] : undefined;
        return (
          <Link
            key={key}
            href={fullHref}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              locked && "opacity-60",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t(key)}</span>
            {locked && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-border bg-muted px-[6px] py-0.5 text-[10px] font-medium text-muted-foreground"
                title={
                  tier
                    ? t("lockedTooltip", { tier })
                    : t("locked")
                }
              >
                <Lock className="size-3" aria-hidden="true" />
                {tier ?? t("locked")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
