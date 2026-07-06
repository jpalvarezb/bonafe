import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listWorkers } from "@/server/services/workers";
import { setWorkerActiveAction } from "@/server/actions/workers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function WorkersPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "labor")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=labor`);
  }

  const t = await getTranslations("workers");
  const workers = await listWorkers(ctx, { includeInactive: true });
  const canManage = can(ctx.role, "worker", "manage");
  const currency = ctx.org.baseCurrencyCode;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canManage && (
          <Button asChild size="sm">
            <Link href={`/o/${orgSlug}/workers/new`}>{t("new")}</Link>
          </Button>
        )}
      </div>

      {workers.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("table.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.code")}</th>
                  <th className="px-4 py-3 font-medium">{t("table.type")}</th>
                  <th className="px-4 py-3 font-medium">
                    {t("table.dailyRate")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("table.hourlyRate")}
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
                {workers.map((worker) => (
                  <tr key={worker.id}>
                    <td className="px-4 py-3 font-medium">{worker.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {worker.code ?? "—"}
                    </td>
                    <td className="px-4 py-3">{t(`types.${worker.type}`)}</td>
                    <td className="px-4 py-3">
                      {worker.dailyRate} {currency}
                    </td>
                    <td className="px-4 py-3">
                      {worker.hourlyRate} {currency}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          worker.active
                            ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {t(worker.active ? "status.active" : "status.inactive")}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/o/${orgSlug}/workers/${worker.id}`}>
                              {t("table.edit")}
                            </Link>
                          </Button>
                          <form action={setWorkerActiveAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input
                              type="hidden"
                              name="orgSlug"
                              value={orgSlug}
                            />
                            <input
                              type="hidden"
                              name="workerId"
                              value={worker.id}
                            />
                            <input
                              type="hidden"
                              name="active"
                              value={(!worker.active).toString()}
                            />
                            <Button variant="ghost" size="sm" type="submit">
                              {t(worker.active ? "table.deactivate" : "table.reactivate")}
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
