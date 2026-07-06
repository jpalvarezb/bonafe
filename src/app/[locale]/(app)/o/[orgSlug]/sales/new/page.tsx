import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listCycles } from "@/server/services/cycles";
import { CURRENCY_CODES } from "@/lib/currency";
import { SaleForm } from "@/components/sales/sale-form";

export default async function NewSalePage({
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
  const cycles = await listCycles(ctx);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      <SaleForm
        locale={locale}
        orgSlug={orgSlug}
        cycles={cycles.map(({ cycle }) => ({ id: cycle.id, name: cycle.name }))}
        currencyCode={ctx.org.baseCurrencyCode}
        currencies={[...CURRENCY_CODES]}
      />
    </div>
  );
}
