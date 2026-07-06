import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { getPurchase } from "@/server/services/purchases";
import { deletePurchaseAction } from "@/server/actions/purchases";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PurchaseDetailPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; purchaseId: string }>;
}>) {
  const { locale, orgSlug, purchaseId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "inventory")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=inventory`);
  }

  const t = await getTranslations("purchases");
  const format = await getFormatter();
  const data = await getPurchase(ctx, purchaseId);
  if (!data) notFound();

  const canDelete = can(ctx.role, "purchase", "delete");
  const currency = data.purchase.currencyCode;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {data.supplierName}
          {data.purchase.invoiceNumber
            ? ` · ${data.purchase.invoiceNumber}`
            : ""}
        </h1>
        {canDelete && (
          <form action={deletePurchaseAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="purchaseId" value={data.purchase.id} />
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
            {data.purchase.date}
          </p>
          <p>
            <span className="text-muted-foreground">{t("currency")}: </span>
            {currency}
          </p>
          {data.purchase.notes && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">{t("notes")}: </span>
              {data.purchase.notes}
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
            {data.lines.map(({ line, productName, unit }) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-4 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{productName}</span>
                <span className="shrink-0 text-muted-foreground">
                  {line.quantity} {unit} ×{" "}
                  {format.number(Number(line.unitCost), {
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
            {format.number(Number(data.purchase.total), {
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
