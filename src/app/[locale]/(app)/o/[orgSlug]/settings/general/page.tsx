import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { cn } from "@/lib/utils";

const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
const BTN =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default async function GeneralSettingsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("plan");

  const rows = [
    { key: "name", value: ctx.org.name },
    { key: "slug", value: ctx.org.slug },
    { key: "currency", value: ctx.org.baseCurrencyCode },
    { key: "country", value: ctx.org.country ?? "—" },
    { key: "timezone", value: ctx.org.timezone },
  ] as const;

  // settings/import returns a blank page (`return null`) for roles lacking
  // catalog:manage (see settings/import/page.tsx) — don't link to a dead end.
  const canImport = can(ctx.role, "catalog", "manage");
  const links = [
    { key: "members", href: `/o/${orgSlug}/settings/members` },
    { key: "plan", href: `/o/${orgSlug}/settings/plan` },
    { key: "currencies", href: `/o/${orgSlug}/settings/currencies` },
    ...(canImport
      ? [{ key: "import", href: `/o/${orgSlug}/settings/import` } as const]
      : []),
    { key: "audit", href: `/o/${orgSlug}/settings/audit` },
  ] as const;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SettingsTabs orgSlug={orgSlug} role={ctx.role} active="general" />
      <h1 className="text-2xl font-semibold">{t("general.title")}</h1>

      <div className="border border-border">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              CELL,
              "flex items-center justify-between border-b border-border last:border-b-0",
            )}
          >
            <span className={MICRO_LABEL}>{t(`general.${row.key}`)}</span>
            <span className="text-[length:var(--density-font-body)] font-medium">
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className={cn(CELL, "flex flex-wrap gap-2 border border-border")}>
        {links.map((link) => (
          <Link key={link.key} href={link.href} className={BTN}>
            {t(`general.links.${link.key}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}
