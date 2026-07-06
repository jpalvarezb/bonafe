import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listSales } from "@/server/services/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function SalesPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "sales")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=sales`);
  }

  const t = await getTranslations("sales");
  const format = await getFormatter();
  const rows = await listSales(ctx);
  const canCreate = can(ctx.role, "sale", "create");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canCreate && (
          <Button asChild>
            <Link href={`/o/${orgSlug}/sales/new`}>{t("new")}</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="divide-y">
              {rows.map(({ sale, cycleName, lineCount }) => (
                <Link
                  key={sale.id}
                  href={`/o/${orgSlug}/sales/${sale.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {sale.buyerName}
                      {sale.invoiceNumber ? ` · ${sale.invoiceNumber}` : ""}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {sale.date}
                      {cycleName ? ` · ${cycleName}` : ""} ·{" "}
                      {t("lineCount", { count: lineCount })}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">
                    {format.number(Number(sale.total), {
                      style: "currency",
                      currency: sale.currencyCode,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
