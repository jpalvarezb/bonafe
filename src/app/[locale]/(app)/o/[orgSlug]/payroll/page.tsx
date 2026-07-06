import { redirect } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listPayrollPeriods } from "@/server/services/payroll";
import { createPayrollPeriodAction } from "@/server/actions/payroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_CHIP_CLASS: Record<"open" | "closed", string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  closed:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
};

export default async function PayrollPeriodsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "payroll")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=payroll`);
  }

  const t = await getTranslations("payroll");
  const format = await getFormatter();

  const periods = await listPayrollPeriods(ctx);
  const canManage = can(ctx.role, "payroll", "manage");

  const money = (value: string, currencyCode: string) =>
    format.number(Number(value), {
      style: "currency",
      currency: currencyCode,
    });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {periods.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {periods.map((period) => (
              <Link
                key={period.id}
                href={`/o/${orgSlug}/payroll/${period.id}`}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{period.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {period.startDate} – {period.endDate}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium">
                    {money(period.totalAmount, period.currencyCode)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_CHIP_CLASS[period.status as "open" | "closed"]
                    }`}
                  >
                    {t(`status.${period.status}`)}
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createPayrollPeriodAction}
              className="grid gap-4 sm:grid-cols-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="startDate">{t("startDate")}</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="endDate">{t("endDate")}</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("create")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
