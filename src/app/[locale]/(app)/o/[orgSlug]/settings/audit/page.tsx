import { and, desc, eq, like } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { withOrgRls } from "@/lib/db/rls";
import { auditLog } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { Input } from "@/components/ui/input";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { cn } from "@/lib/utils";

const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BTN =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const BTN_GHOST =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] px-[var(--density-cell-px)] font-mono text-[length:var(--density-font-body)] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const AUDIT_COLS =
  "grid-cols-[150px_140px_1fr_150px_1.4fr]";

// Only actions with a stub in messages/{locale}/audit.json#actions get a
// translated label; anything else (including future actions added by other
// modules) falls back to the raw action string so the viewer never 500s on
// an unrecognized key.
const KNOWN_ACTIONS = new Set([
  "member.invite",
  "billing.portal_opened",
  "work_order.status",
  "work_order.delete",
  "payroll.close",
  "sale.create",
  "sale.delete",
  "purchase.create",
  "purchase.delete",
  "worker.create",
  "worker.set_active",
  "farm.set_active",
  "parcel.set_active",
  "exchange_rate.set",
  "import.run",
  "org.update",
  "inventory.transfer",
  "billing.subscription_updated",
  "billing.checkout_started",
]);

/** Small inline rendering of the jsonb meta column — never secrets, per audit.ts contract. */
function formatMeta(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "—";
  const entries = Object.entries(meta as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ");
}

export default async function AuditLogPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ action?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  if (!can(ctx.role, "settings", "manage")) {
    redirect(`/${locale}/o/${orgSlug}`);
  }

  const t = await getTranslations("audit");

  const actionPrefix = sp.action?.trim().slice(0, 60) || undefined;

  const rows = await withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        meta: auditLog.meta,
        createdAt: auditLog.createdAt,
        // Snapshot taken at write time (see lib/audit.ts) — stays readable
        // even after the user is renamed or removed; no join needed.
        actorName: auditLog.actorName,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, ctx.org.id),
          actionPrefix ? like(auditLog.action, `${actionPrefix}%`) : undefined,
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(200),
  );

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <SettingsTabs orgSlug={orgSlug} role={ctx.role} active="audit" />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="border border-border">
        <div className="px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">
            {t("filter.label")}
          </span>
        </div>
        <div className="border-t border-border px-3.5 py-3">
          <form
            method="GET"
            action={`/${locale}/o/${orgSlug}/settings/audit`}
            className="flex flex-wrap items-center gap-3"
          >
            <Input
              name="action"
              defaultValue={sp.action ?? ""}
              placeholder={t("filter.placeholder")}
              className={cn(CONTROL, "w-64")}
            />
            <button type="submit" className={BTN}>
              {t("filter.apply")}
            </button>
            {sp.action && (
              <a
                href={`/${locale}/o/${orgSlug}/settings/audit`}
                className={BTN_GHOST}
              >
                {t("filter.clear")}
              </a>
            )}
          </form>
        </div>
      </div>

      <div className="overflow-x-auto border border-border">
        {rows.length === 0 ? (
          <p
            className={cn(
              CELL,
              "text-[length:var(--density-font-body)] text-muted-foreground",
            )}
          >
            {t("empty")}
          </p>
        ) : (
          <div className="min-w-[820px]">
            <div
              className={cn(
                "grid border-b border-border bg-muted/40",
                AUDIT_COLS,
              )}
            >
              <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                {t("table.date")}
              </div>
              <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                {t("table.actor")}
              </div>
              <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                {t("table.action")}
              </div>
              <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                {t("table.entity")}
              </div>
              <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                {t("table.meta")}
              </div>
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "grid items-center border-b border-border transition-colors last:border-b-0 hover:bg-muted/40",
                  AUDIT_COLS,
                )}
              >
                <div
                  className={cn(
                    CELL,
                    "tabular whitespace-nowrap font-mono text-[10.5px] text-muted-foreground",
                  )}
                >
                  {dateFormatter.format(row.createdAt)}
                </div>
                <div className={cn(CELL, "truncate")}>
                  {row.actorName ?? t("table.system")}
                </div>
                <div className={cn(CELL, "truncate font-mono text-[11px]")}>
                  {KNOWN_ACTIONS.has(row.action)
                    ? t(`actions.${row.action}` as "actions.member.invite")
                    : row.action}
                </div>
                <div
                  className={cn(
                    CELL,
                    "whitespace-nowrap font-mono text-[11px] text-muted-foreground",
                  )}
                >
                  {row.entity ?? "—"}
                  {row.entityId ? ` (${row.entityId.slice(0, 8)})` : ""}
                </div>
                <div
                  className={cn(
                    CELL,
                    "break-all font-mono text-[10.5px] text-muted-foreground",
                  )}
                >
                  {formatMeta(row.meta)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
