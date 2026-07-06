import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listSuppliers } from "@/server/services/suppliers";
import { listProducts } from "@/server/services/catalog";
import { CURRENCY_CODES } from "@/lib/currency";
import { Link } from "@/i18n/navigation";
import { PurchaseForm } from "@/components/purchases/purchase-form";

export default async function NewPurchasePage({
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
  const [suppliers, products] = await Promise.all([
    listSuppliers(ctx),
    listProducts(ctx),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      {suppliers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("noSuppliers")}{" "}
          <Link
            href={`/o/${orgSlug}/purchases/suppliers`}
            className="underline underline-offset-4"
          >
            {t("suppliers.title")}
          </Link>
        </p>
      )}
      <PurchaseForm
        locale={locale}
        orgSlug={orgSlug}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
        }))}
        currencyCode={ctx.org.baseCurrencyCode}
        currencies={[...CURRENCY_CODES]}
      />
    </div>
  );
}
