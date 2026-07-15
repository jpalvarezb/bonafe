import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listPurchases } from "@/server/services/purchases";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function PurchasesPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "inventory")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=inventory`);
  }

  const t = await getTranslations("purchases");
  const tImporter = await getTranslations("importer");
  const format = await getFormatter();
  const rows = await listPurchases(ctx);
  const canCreate = can(ctx.role, "purchase", "create");
  const canExport = can(ctx.role, "report", "view");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {canExport && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/export?type=purchases&org=${orgSlug}&locale=${locale}`}
              >
                {tImporter("exportCsv")}
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/o/${orgSlug}/purchases/suppliers`}>
              {t("suppliers.title")}
            </Link>
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href={`/o/${orgSlug}/purchases/new`}>{t("new")}</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="divide-y">
              {rows.map(({ purchase, supplierName, lineCount }) => (
                <Link
                  key={purchase.id}
                  href={`/o/${orgSlug}/purchases/${purchase.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {supplierName}
                      {purchase.invoiceNumber
                        ? ` · ${purchase.invoiceNumber}`
                        : ""}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {purchase.date} · {t("lineCount", { count: lineCount })}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">
                    {format.number(Number(purchase.total), {
                      style: "currency",
                      currency: purchase.currencyCode,
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
