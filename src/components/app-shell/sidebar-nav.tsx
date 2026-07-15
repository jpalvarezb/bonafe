"use client";

import { useId, useState } from "react";
import {
  ChevronRight,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
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
  type NavSection,
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
  /** When true, renders the icon-only rail (SidebarShell's collapsed width) instead of the full tree. */
  readonly collapsed?: boolean;
  /** Called when a rail link that would normally open a section is clicked, so SidebarShell can re-expand. */
  readonly onExpand?: () => void;
  /** When set, renders the collapse/expand toggle next to the pinned Dashboard row (desktop shell only — the mobile drawer omits it). */
  readonly onToggleCollapse?: () => void;
}) {
  const {
    orgSlug,
    features,
    featureTiers,
    onNavigate,
    collapsed = false,
    onExpand,
    onToggleCollapse,
  } = props;
  const t = useTranslations("common.nav");
  const pathname = usePathname();

  function sectionHasActiveRoute(section: NavSection) {
    return section.items.some((item) =>
      pathname.startsWith(`/o/${orgSlug}/${item.href}`),
    );
  }

  // Session-only expansion state (no localStorage — spec is per-visit).
  // Effective expanded state is `override ?? sectionHasActiveRoute`, so a
  // section auto-expands whenever it holds the active route and the user
  // hasn't manually toggled it since arriving there.
  const [manualOverrides, setManualOverrides] = useState<
    Readonly<Record<string, boolean>>
  >({});
  // Unique per instance: the desktop aside and the open mobile drawer both
  // render SidebarNav, so static section ids would collide (invalid HTML,
  // ambiguous aria-controls).
  const instanceId = useId();

  // Derived-during-render reset (same pattern as MobileNavDrawer's
  // close-on-navigate effect): this component never remounts across
  // client-side navigations, so on a pathname change we clear any manual
  // override on the section that just became active, letting
  // `override ?? isActive` win it open again. Other sections' overrides are
  // left untouched — multi-open, independent toggles.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    const activeSection = NAV_SECTIONS.find((section) =>
      sectionHasActiveRoute(section),
    );
    if (activeSection && activeSection.key in manualOverrides) {
      setManualOverrides((prev) => {
        const next = { ...prev };
        delete next[activeSection.key];
        return next;
      });
    }
  }

  function isSectionExpanded(section: NavSection) {
    return manualOverrides[section.key] ?? sectionHasActiveRoute(section);
  }

  function toggleSection(section: NavSection) {
    const current = isSectionExpanded(section);
    setManualOverrides((prev) => ({ ...prev, [section.key]: !current }));
  }

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

  const toggleLabel = collapsed ? t("expandSidebar") : t("collapseSidebar");
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const collapseToggle = onToggleCollapse ? (
    <button
      type="button"
      onClick={onToggleCollapse}
      aria-expanded={!collapsed}
      aria-label={toggleLabel}
      title={toggleLabel}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[3px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        collapsed ? "mx-auto size-9" : "size-8",
      )}
    >
      <ToggleIcon className="size-4 shrink-0" />
    </button>
  ) : null;

  if (collapsed) {
    const railLink = ({
      key,
      href,
      icon: Icon,
      label,
      active,
      muted,
      onClick,
    }: {
      key: string;
      href: string;
      icon: LucideIcon;
      label: string;
      active: boolean;
      muted?: boolean;
      onClick?: () => void;
    }) => {
      return (
        <Link
          key={key}
          href={href}
          onClick={onClick}
          title={label}
          aria-label={label}
          className={cn(
            "mx-auto flex size-9 items-center justify-center rounded-[3px] p-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            muted && "opacity-60",
          )}
        >
          <Icon className="size-4 shrink-0" />
        </Link>
      );
    };

    const dashboardHref = `/o/${orgSlug}/${NAV_PINNED_TOP.href}`;
    const dashboardActive = pathname.startsWith(dashboardHref);

    return (
      <nav className="flex h-full flex-col items-center gap-2 p-2">
        <div className="flex w-full flex-col gap-1">
          {railLink({
            key: NAV_PINNED_TOP.key,
            href: dashboardHref,
            icon: NAV_PINNED_TOP.icon,
            label: t(NAV_PINNED_TOP.key),
            active: dashboardActive,
            onClick: onNavigate,
          })}
        </div>

        <div className="flex w-full flex-col gap-1">
          {NAV_SECTIONS.map((section) => {
            if (isSectionCollapsed(section, features)) {
              const tier = lowestUnlockTier(section.items, featureTiers);
              const tooltip = tier
                ? t("lockedTooltip", { tier })
                : t("locked");
              return railLink({
                key: section.key,
                href: `/o/${orgSlug}/settings/plan`,
                icon: section.icon,
                label: tooltip,
                active: false,
                muted: true,
                onClick: onNavigate,
              });
            }

            const target =
              section.items.find(
                (item) =>
                  !(item.feature != null && !features.includes(item.feature)),
              ) ?? section.items[0];

            return railLink({
              key: section.key,
              href: `/o/${orgSlug}/${target.href}`,
              icon: section.icon,
              label: t(section.labelKey),
              active: sectionHasActiveRoute(section),
              onClick: () => {
                onExpand?.();
                onNavigate?.();
              },
            });
          })}
        </div>

        <div className="mt-auto flex w-full flex-col gap-1 border-t border-border pt-2">
          {collapseToggle}
          {railLink({
            key: NAV_PINNED_BOTTOM.key,
            href: settingsHref,
            icon: NAV_PINNED_BOTTOM.icon,
            label: t(NAV_PINNED_BOTTOM.key),
            active: settingsActive,
            onClick: onNavigate,
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="flex h-full flex-col gap-4 p-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{renderItem(NAV_PINNED_TOP)}</div>
        {collapseToggle}
      </div>

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

        const expanded = isSectionExpanded(section);
        const itemsId = `${instanceId}-nav-section-${section.key}-items`;
        return (
          <div key={section.key} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggleSection(section)}
              aria-expanded={expanded}
              aria-controls={itemsId}
              className="flex items-center gap-1 rounded-md px-3 pt-2 text-left font-mono text-[10px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150",
                  expanded && "rotate-90",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">
                {t(section.labelKey)}
              </span>
            </button>
            {expanded && (
              <div id={itemsId} className="flex flex-col gap-1">
                {section.items.map(renderItem)}
              </div>
            )}
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
