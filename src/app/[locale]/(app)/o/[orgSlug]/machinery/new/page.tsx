import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { MachineForm } from "@/components/machinery/machine-form";

export default async function NewMachinePage({
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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      <MachineForm locale={locale} orgSlug={orgSlug} />
    </div>
  );
}
