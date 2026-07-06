import { and, desc, eq, like } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  const rows = await db
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
    .limit(200);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("filter.label")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            method="GET"
            action={`/${locale}/o/${orgSlug}/settings/audit`}
            className="flex flex-wrap gap-3"
          >
            <Input
              name="action"
              defaultValue={sp.action ?? ""}
              placeholder={t("filter.placeholder")}
              className="w-64"
            />
            <Button type="submit">{t("filter.apply")}</Button>
            {sp.action && (
              <Button asChild variant="ghost">
                <a href={`/${locale}/o/${orgSlug}/settings/audit`}>
                  {t("filter.clear")}
                </a>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-muted-foreground">{t("empty")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("table.date")}</th>
                  <th className="px-4 py-2 font-medium">{t("table.actor")}</th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.action")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.entity")}
                  </th>
                  <th className="px-4 py-2 font-medium">{t("table.meta")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {dateFormatter.format(row.createdAt)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {row.actorName ?? t("table.system")}
                    </td>
                    <td className="px-4 py-2">
                      {KNOWN_ACTIONS.has(row.action)
                        ? t(`actions.${row.action}` as "actions.member.invite")
                        : row.action}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {row.entity ?? "—"}
                      {row.entityId ? ` (${row.entityId.slice(0, 8)})` : ""}
                    </td>
                    <td className="px-4 py-2 break-all text-muted-foreground">
                      {formatMeta(row.meta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
