import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import Decimal from "decimal.js";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  listActiveWorkersForPiecework,
  listPieceRates,
  listPieceworkEntries,
} from "@/server/services/piecework";
import { listCycles } from "@/server/services/cycles";
import {
  createPieceRateAction,
  deletePieceworkEntryAction,
  setPieceRateActiveAction,
} from "@/server/actions/piecework";
import { PieceworkEntryForm } from "@/components/piecework/piecework-entry-form";
import { PendingEntries } from "@/components/offline/pending-entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Default entries range: the current fortnight (1st–15th or 16th–end). */
function currentFortnight(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const monthPad = pad(month + 1);
  if (day <= 15) {
    return { from: `${year}-${monthPad}-01`, to: `${year}-${monthPad}-15` };
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${monthPad}-16`,
    to: `${year}-${monthPad}-${pad(lastDay)}`,
  };
}

export default async function PieceworkPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "payroll")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=payroll`);
  }

  const t = await getTranslations("piecework");
  const format = await getFormatter();
  const currency = ctx.org.baseCurrencyCode;

  const fallback = currentFortnight();
  const range = {
    from: sp.from && isoDate.test(sp.from) ? sp.from : fallback.from,
    to: sp.to && isoDate.test(sp.to) ? sp.to : fallback.to,
  };

  const [rates, activeWorkers, entries, cycles] = await Promise.all([
    listPieceRates(ctx),
    listActiveWorkersForPiecework(ctx),
    listPieceworkEntries(ctx, range),
    listCycles(ctx),
  ]);
  const activeRates = rates.filter((rate) => rate.active);

  const canManageRates = can(ctx.role, "piecework", "manage");
  const canCreateEntry = can(ctx.role, "piecework", "create");
  const canDeleteEntry = can(ctx.role, "piecework", "delete");

  const money = (value: string) =>
    format.number(Number(value), { style: "currency", currency });

  const totalsByWorker = new Map<string, { name: string; total: Decimal }>();
  let grandTotal = new Decimal(0);
  for (const row of entries) {
    grandTotal = grandTotal.add(row.entry.amount);
    const existing = totalsByWorker.get(row.entry.workerId);
    if (existing) {
      existing.total = existing.total.add(row.entry.amount);
    } else {
      totalsByWorker.set(row.entry.workerId, {
        name: row.workerName,
        total: new Decimal(row.entry.amount),
      });
    }
  }
  const workerTotals = [...totalsByWorker.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("rates.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("rates.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">
                      {t("rates.table.name")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("rates.table.unit")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("rates.table.rate")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("rates.table.status")}
                    </th>
                    {canManageRates && (
                      <th className="px-4 py-2 font-medium">
                        {t("rates.table.actions")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rates.map((rate) => (
                    <tr key={rate.id}>
                      <td className="px-4 py-2 font-medium">{rate.name}</td>
                      <td className="px-4 py-2">{rate.unit}</td>
                      <td className="px-4 py-2">
                        {rate.rate} {currency}
                      </td>
                      <td className="px-4 py-2">
                        <StatusChip
                          family="life"
                          state={rate.active ? "active" : "inactive"}
                        >
                          {t(rate.active ? "rates.status.active" : "rates.status.inactive")}
                        </StatusChip>
                      </td>
                      {canManageRates && (
                        <td className="px-4 py-2">
                          <form action={setPieceRateActiveAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input
                              type="hidden"
                              name="orgSlug"
                              value={orgSlug}
                            />
                            <input
                              type="hidden"
                              name="pieceRateId"
                              value={rate.id}
                            />
                            <input
                              type="hidden"
                              name="active"
                              value={(!rate.active).toString()}
                            />
                            <Button variant="ghost" size="sm" type="submit">
                              {t(
                                rate.active
                                  ? "rates.table.deactivate"
                                  : "rates.table.reactivate",
                              )}
                            </Button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManageRates && (
            <form
              action={createPieceRateAction}
              className="grid gap-4 border-t pt-4 sm:grid-cols-4"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="rateName">{t("rates.form.name")}</Label>
                <Input
                  id="rateName"
                  name="name"
                  required
                  maxLength={160}
                  placeholder={t("rates.form.namePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rateUnit">{t("rates.form.unit")}</Label>
                <Input
                  id="rateUnit"
                  name="unit"
                  required
                  maxLength={40}
                  defaultValue="unidad"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rateAmount">{t("rates.form.rate")}</Label>
                <Input
                  id="rateAmount"
                  name="rate"
                  type="number"
                  min="0"
                  step="any"
                  required
                />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("rates.form.create")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <PendingEntries orgSlug={orgSlug} kind="piecework.create" />

      <Card>
        <CardHeader>
          <CardTitle>{t("entries.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="from">{t("entries.from")}</Label>
              <Input id="from" name="from" type="date" defaultValue={range.from} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="to">{t("entries.to")}</Label>
              <Input id="to" name="to" type="date" defaultValue={range.to} />
            </div>
            <Button type="submit" variant="outline">
              {t("entries.apply")}
            </Button>
          </form>

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("entries.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">
                      {t("entries.table.date")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("entries.table.worker")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("entries.table.rate")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("entries.table.cycle")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("entries.table.quantity")}
                    </th>
                    <th className="px-4 py-2 font-medium">
                      {t("entries.table.amount")}
                    </th>
                    {canDeleteEntry && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map(({ entry, workerName, rateName, unit, cycleName }) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2">{entry.date}</td>
                      <td className="px-4 py-2">{workerName}</td>
                      <td className="px-4 py-2">{rateName}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {cycleName ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        {entry.quantity} {unit}
                      </td>
                      <td className="px-4 py-2 font-medium">
                        {money(entry.amount)}
                      </td>
                      {canDeleteEntry && (
                        <td className="px-4 py-2 text-right">
                          <form action={deletePieceworkEntryAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input
                              type="hidden"
                              name="orgSlug"
                              value={orgSlug}
                            />
                            <input
                              type="hidden"
                              name="entryId"
                              value={entry.id}
                            />
                            <Button variant="ghost" size="sm" type="submit">
                              {t("entries.delete")}
                            </Button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {workerTotals.length > 0 && (
            <div className="flex flex-col gap-1 border-t pt-4 text-sm">
              {workerTotals.map((worker) => (
                <div key={worker.name} className="flex justify-between">
                  <span className="text-muted-foreground">{worker.name}</span>
                  <span className="font-medium">
                    {money(worker.total.toFixed(4))}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>{t("entries.grandTotal")}</span>
                <span>{money(grandTotal.toFixed(4))}</span>
              </div>
            </div>
          )}

          {canCreateEntry &&
            (activeWorkers.length === 0 || activeRates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("entries.form.needsSetup")}
              </p>
            ) : (
              <div className="border-t pt-4">
                <PieceworkEntryForm
                  orgSlug={orgSlug}
                  workers={activeWorkers}
                  rates={activeRates.map((rate) => ({
                    id: rate.id,
                    name: rate.name,
                    unit: rate.unit,
                  }))}
                  cycles={cycles.map(({ cycle }) => ({
                    id: cycle.id,
                    name: cycle.name,
                  }))}
                />
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
