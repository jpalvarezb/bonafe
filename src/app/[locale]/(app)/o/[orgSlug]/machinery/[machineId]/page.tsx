import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { can } from "@/lib/authz";
import {
  getMachine,
  listUsageLogs,
} from "@/server/services/machinery";
import { setMachineActiveAction } from "@/server/actions/machinery";
import { listActivities } from "@/server/services/activities";
import { listWorkOrders } from "@/server/services/work-orders";
import { listActiveWorkers } from "@/server/services/workers";
import { MachineForm } from "@/components/machinery/machine-form";
import { UsageLogForm } from "@/components/machinery/usage-log-form";
import { UsageLogTable } from "@/components/machinery/usage-log-table";
import { Button } from "@/components/ui/button";

export default async function MachineDetailPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; machineId: string }>;
}>) {
  const { locale, orgSlug, machineId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "machinery")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=machinery`);
  }

  const t = await getTranslations("machinery");
  const machine = await getMachine(ctx, machineId);
  if (!machine) notFound();

  const canManage = can(ctx.role, "machine", "manage");
  const canLog = can(ctx.role, "machine", "log");
  const currency = ctx.org.baseCurrencyCode;

  const [recentActivities, activeWorkOrders, operators, logs] =
    await Promise.all([
      listActivities(ctx, { limit: 50 }),
      listWorkOrders(ctx, { excludeCancelled: true }),
      listActiveWorkers(ctx),
      listUsageLogs(ctx, { machineId }),
    ]);

  const activityOptions = recentActivities.map(({ activity, typeName }) => ({
    id: activity.id,
    label: activity.description
      ? `${activity.date} · ${typeName} · ${activity.description}`
      : `${activity.date} · ${typeName}`,
  }));

  const workOrderOptions = activeWorkOrders.map(({ workOrder }) => ({
    id: workOrder.id,
    label: `${workOrder.code} · ${workOrder.title}`,
  }));

  const operatorOptions = operators.map((worker) => ({
    id: worker.id,
    label: worker.name,
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {machine.name} · {t("table.edit")}
        </h1>
        {canManage && (
          <form action={setMachineActiveAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="machineId" value={machine.id} />
            <input
              type="hidden"
              name="active"
              value={(!machine.active).toString()}
            />
            <Button
              variant={machine.active ? "destructive" : "secondary"}
              size="sm"
              type="submit"
            >
              {t(machine.active ? "table.deactivate" : "table.reactivate")}
            </Button>
          </form>
        )}
      </div>

      <MachineForm
        locale={locale}
        orgSlug={orgSlug}
        machine={{
          id: machine.id,
          name: machine.name,
          code: machine.code,
          category: machine.category,
          brand: machine.brand,
          model: machine.model,
          year: machine.year,
          hourlyCost: machine.hourlyCost,
          notes: machine.notes,
        }}
      />

      <h2 className="text-xl font-semibold">{t("logs.title")}</h2>

      {canLog && (
        <UsageLogForm
          locale={locale}
          orgSlug={orgSlug}
          machineId={machine.id}
          activities={activityOptions}
          workOrders={workOrderOptions}
          operators={operatorOptions}
        />
      )}

      <UsageLogTable
        locale={locale}
        orgSlug={orgSlug}
        machineId={machine.id}
        logs={logs}
        currency={currency}
        canLog={canLog}
      />
    </div>
  );
}
