import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listWarehouses } from "@/server/services/warehouses";
import { listProducts } from "@/server/services/catalog";
import { TransferForm } from "@/components/warehouses/transfer-form";

const KNOWN_ERROR_KEYS = ["insufficientStock", "sameWarehouse", "notFound"];

export default async function NewTransferPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const { error } = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "warehouses")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=warehouses`);
  }

  const t = await getTranslations("warehouses");
  const [warehouses, products] = await Promise.all([
    listWarehouses(ctx),
    listProducts(ctx),
  ]);

  const errorKey = error && KNOWN_ERROR_KEYS.includes(error) ? error : error ? "unknown" : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("transfers.new")}</h1>

      {errorKey && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`transfers.errors.${errorKey}`)}
        </p>
      )}

      {warehouses.length < 2 && (
        <p className="text-sm text-muted-foreground">
          {t("transfers.needTwoWarehouses")}
        </p>
      )}

      <TransferForm
        locale={locale}
        orgSlug={orgSlug}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
        }))}
      />
    </div>
  );
}
