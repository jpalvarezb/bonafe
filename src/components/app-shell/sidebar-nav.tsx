"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/lib/auth/permissions";
import {
  NAV_PINNED_TOP,
  NAV_PINNED_BOTTOM,
  NAV_SECTIONS,
  isSectionCollapsed,
  lowestUnlockTier,
  type NavItem,
} from "./nav-config";

function LockBadge({
  tier,
  tooltip,
  fallback,
}: {
  tier: string | undefined;
  tooltip: string;
  fallback: string;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-border bg-muted px-[6px] py-0.5 text-[10px] font-medium text-muted-foreground"
      title={tooltip}
    >
      <Lock className="size-3" aria-hidden="true" />
      {tier ?? fallback}
    </span>
  );
}

export function SidebarNav(props: {
  readonly orgSlug: string;
  // Threaded through today (unused below) so Phase 1 can gate on
  // `NavItem.minRole` without another prop-drilling pass — see Phase 0's
  // NavItem comment for why no item sets minRole yet.
  readonly role: OrgRole;
  readonly features: readonly string[];
  readonly featureTiers: Readonly<Record<string, string>>;
  /** Called after a nav Link is clicked — the mobile drawer uses this to close itself on navigation. */
  readonly onNavigate?: () => void;
}) {
  const { orgSlug, features, featureTiers, onNavigate } = props;
  const t = useTranslations("common.nav");
  const pathname = usePathname();

  function renderItem(item: NavItem) {
    const fullHref = `/o/${orgSlug}/${item.href}`;
    const active = pathname.startsWith(fullHref);
    const locked = item.feature != null && !features.includes(item.feature);
    const tier = locked ? featureTiers[item.feature!] : undefined;
    return (
      <Link
        key={item.key}
        href={fullHref}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          locked && "opacity-60",
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t(item.key)}</span>
        {locked && (
          <LockBadge
            tier={tier}
            tooltip={tier ? t("lockedTooltip", { tier }) : t("locked")}
            fallback={t("locked")}
          />
        )}
      </Link>
    );
  }

  const settingsHref = `/o/${orgSlug}/${NAV_PINNED_BOTTOM.href}`;
  const settingsActive = pathname.startsWith(`/o/${orgSlug}/settings`);

  return (
    <nav className="flex h-full flex-col gap-4 p-2">
      <div className="flex flex-col gap-1">{renderItem(NAV_PINNED_TOP)}</div>

      {NAV_SECTIONS.map((section) => {
        if (isSectionCollapsed(section, features)) {
          const tier = lowestUnlockTier(section.items, featureTiers);
          const tooltip = tier ? t("lockedTooltip", { tier }) : t("locked");
          return (
            <div key={section.key} className="flex flex-col gap-1">
              <Link
                href={`/o/${orgSlug}/settings/plan`}
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground opacity-60 transition-colors hover:bg-accent/50 hover:text-foreground"
                title={tooltip}
              >
                <section.icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-wide uppercase">
                  {t(section.labelKey)}
                </span>
                <LockBadge tier={tier} tooltip={tooltip} fallback={t("locked")} />
              </Link>
            </div>
          );
        }

        return (
          <div key={section.key} className="flex flex-col gap-1">
            <p className="px-3 pt-2 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {t(section.labelKey)}
            </p>
            {section.items.map(renderItem)}
          </div>
        );
      })}

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
        <Link
          href={settingsHref}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            settingsActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <NAV_PINNED_BOTTOM.icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {t(NAV_PINNED_BOTTOM.key)}
          </span>
        </Link>
      </div>
    </nav>
  );
}
