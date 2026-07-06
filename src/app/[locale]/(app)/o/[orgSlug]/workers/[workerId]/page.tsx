import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { can } from "@/lib/authz";
import { getWorker } from "@/server/services/workers";
import { setWorkerActiveAction } from "@/server/actions/workers";
import { WorkerForm } from "@/components/workers/worker-form";
import { Button } from "@/components/ui/button";

export default async function EditWorkerPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; workerId: string }>;
}>) {
  const { locale, orgSlug, workerId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "labor")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=labor`);
  }

  const t = await getTranslations("workers");
  const worker = await getWorker(ctx, workerId);
  if (!worker) notFound();
  const canManage = can(ctx.role, "worker", "manage");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {worker.name} · {t("table.edit")}
        </h1>
        {canManage && (
          <form action={setWorkerActiveAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="workerId" value={worker.id} />
            <input
              type="hidden"
              name="active"
              value={(!worker.active).toString()}
            />
            <Button
              variant={worker.active ? "destructive" : "secondary"}
              size="sm"
              type="submit"
            >
              {t(worker.active ? "table.deactivate" : "table.reactivate")}
            </Button>
          </form>
        )}
      </div>
      <WorkerForm
        locale={locale}
        orgSlug={orgSlug}
        worker={{
          id: worker.id,
          name: worker.name,
          code: worker.code,
          documentId: worker.documentId,
          phone: worker.phone,
          type: worker.type as "fixed" | "temporary",
          dailyRate: worker.dailyRate,
          hourlyRate: worker.hourlyRate,
          notes: worker.notes,
        }}
      />
    </div>
  );
}
