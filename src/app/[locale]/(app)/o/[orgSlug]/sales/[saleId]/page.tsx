import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { getSale } from "@/server/services/sales";
import { deleteSaleAction } from "@/server/actions/sales";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SaleDetailPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; saleId: string }>;
}>) {
  const { locale, orgSlug, saleId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "sales")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=sales`);
  }

  const t = await getTranslations("sales");
  const format = await getFormatter();
  const data = await getSale(ctx, saleId);
  if (!data) notFound();

  const canDelete = can(ctx.role, "sale", "delete");
  const currency = data.sale.currencyCode;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {data.sale.buyerName}
          {data.sale.invoiceNumber ? ` · ${data.sale.invoiceNumber}` : ""}
        </h1>
        {canDelete && (
          <form action={deleteSaleAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="saleId" value={data.sale.id} />
            <Button variant="destructive" size="sm" type="submit">
              {t("delete")}
            </Button>
          </form>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-2 pt-6 sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">{t("date")}: </span>
            {data.sale.date}
          </p>
          <p>
            <span className="text-muted-foreground">{t("currency")}: </span>
            {currency}
          </p>
          <p>
            <span className="text-muted-foreground">{t("cropCycle")}: </span>
            {data.cycleName ?? t("noCycle")}
          </p>
          {data.sale.notes && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">{t("notes")}: </span>
              {data.sale.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("lines.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {data.lines.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-4 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {line.description}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {line.quantity} {line.unit} ×{" "}
                  {format.number(Number(line.unitPrice), {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="shrink-0 font-medium">
                  {format.number(Number(line.total), {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end text-lg font-semibold">
            {t("total")}:{" "}
            {format.number(Number(data.sale.total), {
              style: "currency",
              currency,
              maximumFractionDigits: 2,
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
