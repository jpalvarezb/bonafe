import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { WorkerForm } from "@/components/workers/worker-form";

export default async function NewWorkerPage({
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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      <WorkerForm locale={locale} orgSlug={orgSlug} />
    </div>
  );
}
