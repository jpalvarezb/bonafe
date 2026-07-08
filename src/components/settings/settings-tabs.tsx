import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { can } from "@/lib/authz";
import type { OrgRole } from "@/lib/auth/permissions";

export type SettingsTabKey =
  | "general"
  | "members"
  | "plan"
  | "currencies"
  | "import"
  | "audit";

const ALL_TABS: readonly SettingsTabKey[] = [
  "general",
  "members",
  "plan",
  "currencies",
  "import",
  "audit",
];

const TAB_HREF: Record<SettingsTabKey, string> = {
  general: "settings/general",
  members: "settings/members",
  plan: "settings/plan",
  currencies: "settings/currencies",
  import: "settings/import",
  audit: "settings/audit",
};

/**
 * Interim hub shell for the six settings pages — Phase 2 folds Catálogo
 * into this hub too. Permission-filtered per tab: Importar mirrors
 * settings/import/page.tsx's own gate (catalog:manage — that page silently
 * `return null`s otherwise, so don't link to a dead end); Auditoría mirrors
 * settings/audit/page.tsx's own gate (settings:manage — that page redirects
 * otherwise).
 */
export async function SettingsTabs({
  orgSlug,
  role,
  active,
}: {
  readonly orgSlug: string;
  readonly role: OrgRole;
  readonly active: SettingsTabKey;
}) {
  const t = await getTranslations("common");

  const tabs = ALL_TABS.filter((key) => {
    if (key === "import") return can(role, "catalog", "manage");
    if (key === "audit") return can(role, "settings", "manage");
    return true;
  });

  const labelFor = (key: SettingsTabKey) =>
    key === "members" ? t("nav.members") : t(`settingsTabs.${key}`);

  return (
    <nav
      aria-label={t("settingsTabs.navLabel")}
      className="flex flex-wrap gap-4 border-b border-border font-mono text-[10px] tracking-wide uppercase"
    >
      {tabs.map((key) => (
        <Link
          key={key}
          href={`/o/${orgSlug}/${TAB_HREF[key]}`}
          className={cn(
            "-mb-px border-b-2 px-0.5 pb-2 transition-colors",
            active === key
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {labelFor(key)}
        </Link>
      ))}
    </nav>
  );
}
