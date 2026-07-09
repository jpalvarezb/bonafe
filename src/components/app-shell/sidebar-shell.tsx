"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/lib/auth/permissions";
import { SidebarNav } from "./sidebar-nav";
import { SIDEBAR_COLLAPSED_COOKIE } from "./sidebar-cookie";

function persistCollapsed(next: boolean) {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Desktop sidebar shell: owns the collapsed/expanded width + the aside
 * chrome, and renders SidebarNav in either its full tree or icon-rail mode.
 * The mobile drawer renders SidebarNav directly (full width, no shell).
 */
export function SidebarShell(props: {
  readonly orgSlug: string;
  readonly role: OrgRole;
  readonly features: readonly string[];
  readonly featureTiers: Readonly<Record<string, string>>;
  readonly defaultCollapsed: boolean;
}) {
  const { orgSlug, role, features, featureTiers, defaultCollapsed } = props;
  const t = useTranslations("common.nav");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    persistCollapsed(next);
  }

  function expand() {
    if (!collapsed) return;
    setCollapsed(false);
    persistCollapsed(false);
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? t("expandSidebar") : t("collapseSidebar");

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r md:flex motion-safe:transition-[width] motion-safe:duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav
          orgSlug={orgSlug}
          role={role}
          features={features}
          featureTiers={featureTiers}
          collapsed={collapsed}
          onExpand={expand}
        />
      </div>
      <div className="border-t border-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="mx-auto flex"
        >
          <ToggleIcon />
        </Button>
      </div>
    </aside>
  );
}
