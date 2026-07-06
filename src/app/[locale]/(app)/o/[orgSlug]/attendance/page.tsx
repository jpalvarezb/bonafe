import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listActiveWorkers } from "@/server/services/workers";
import { listAttendanceRange } from "@/server/services/attendance";
import { AttendanceGrid } from "@/components/attendance/attendance-grid";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export default async function AttendancePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ date?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "labor")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=labor`);
  }

  const t = await getTranslations("attendance");
  const date = sp.date && isoDate.test(sp.date) ? sp.date : todayIso();

  const [activeWorkers, records] = await Promise.all([
    listActiveWorkers(ctx),
    listAttendanceRange(ctx, { from: date, to: date }),
  ]);

  const recordByWorker = new Map(
    records.map(({ record }) => [record.workerId, record]),
  );

  const rows = activeWorkers.map((worker) => {
    const existing = recordByWorker.get(worker.id);
    return {
      workerId: worker.id,
      name: worker.name,
      code: worker.code,
      status: existing?.status ?? null,
      hoursWorked: existing?.hoursWorked ?? null,
      notes: existing?.notes ?? null,
    };
  });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {activeWorkers.length === 0 ? (
        <p className="text-muted-foreground">{t("noWorkers")}</p>
      ) : (
        <AttendanceGrid key={date} orgSlug={orgSlug} date={date} rows={rows} />
      )}
    </div>
  );
}
