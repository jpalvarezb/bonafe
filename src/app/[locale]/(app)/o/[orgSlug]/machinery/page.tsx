import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listMachines } from "@/server/services/machinery";
import { setMachineActiveAction } from "@/server/actions/machinery";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

export default async function MachineryPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "machinery")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=machinery`);
  }

  const t = await getTranslations("machinery");
  const machines = await listMachines(ctx, { includeInactive: true });
  const canManage = can(ctx.role, "machine", "manage");
  const currency = ctx.org.baseCurrencyCode;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canManage && (
          <Button asChild size="sm">
            <Link href={`/o/${orgSlug}/machinery/new`}>{t("new")}</Link>
          </Button>
        )}
      </div>

      {machines.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("table.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.code")}</th>
                  <th className="px-4 py-3 font-medium">
                    {t("table.category")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("table.brandModel")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("table.hourlyCost")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("table.status")}
                  </th>
                  {canManage && (
                    <th className="px-4 py-3 font-medium">
                      {t("table.actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {machines.map((machine) => (
                  <tr key={machine.id}>
                    <td className="px-4 py-3 font-medium">{machine.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {machine.code ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {machine.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[machine.brand, machine.model].filter(Boolean).join(" · ") ||
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      {machine.hourlyCost} {currency}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip
                        family="life"
                        state={machine.active ? "active" : "inactive"}
                      >
                        {t(machine.active ? "status.active" : "status.inactive")}
                      </StatusChip>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/o/${orgSlug}/machinery/${machine.id}`}>
                              {t("table.edit")}
                            </Link>
                          </Button>
                          <form action={setMachineActiveAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input
                              type="hidden"
                              name="orgSlug"
                              value={orgSlug}
                            />
                            <input
                              type="hidden"
                              name="machineId"
                              value={machine.id}
                            />
                            <input
                              type="hidden"
                              name="active"
                              value={(!machine.active).toString()}
                            />
                            <Button variant="ghost" size="sm" type="submit">
                              {t(
                                machine.active
                                  ? "table.deactivate"
                                  : "table.reactivate",
                              )}
                            </Button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
