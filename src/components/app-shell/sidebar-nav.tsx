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
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "dashboard", href: "dashboard", icon: LayoutDashboard },
  { key: "farms", href: "farms", icon: MapPinned },
  { key: "map", href: "map", icon: MapIcon },
  { key: "cycles", href: "cycles", icon: RefreshCcw },
  { key: "activities", href: "activities", icon: ClipboardList },
  { key: "workOrders", href: "work-orders", icon: ClipboardCheck },
  { key: "monitoring", href: "monitoring", icon: Bug },
  { key: "climate", href: "climate", icon: CloudRain },
  { key: "harvests", href: "harvests", icon: Wheat },
  { key: "workers", href: "workers", icon: HardHat },
  { key: "attendance", href: "attendance", icon: CalendarCheck },
  { key: "payroll", href: "payroll", icon: Wallet },
  { key: "purchases", href: "purchases", icon: ShoppingCart },
  { key: "inventory", href: "inventory", icon: Boxes },
  { key: "laborReport", href: "reports/labor", icon: BarChart3 },
  { key: "costCenters", href: "cost-centers", icon: FolderTree },
  { key: "products", href: "catalog/products", icon: Package },
  { key: "crops", href: "catalog/crops", icon: Sprout },
  { key: "members", href: "settings/members", icon: Users },
  { key: "settings", href: "settings/general", icon: Settings },
] as const;

export function SidebarNav({ orgSlug }: { readonly orgSlug: string }) {
  const t = useTranslations("common.nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
        const fullHref = `/o/${orgSlug}/${href}`;
        const active = pathname.startsWith(fullHref);
        return (
          <Link
            key={key}
            href={fullHref}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
