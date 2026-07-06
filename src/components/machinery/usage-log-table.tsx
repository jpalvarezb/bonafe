import Decimal from "decimal.js";
import { getTranslations } from "next-intl/server";
import { deleteUsageLogAction } from "@/server/actions/machinery";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LogRow = {
  log: {
    id: string;
    date: string;
    hoursUsed: string;
    fuelLiters: string | null;
    fuelCost: string;
    totalCost: string;
    notes: string | null;
  };
  machineName: string;
  operatorName: string | null;
  activityDate: string | null;
  activityDescription: string | null;
  workOrderCode: string | null;
};

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly machineId: string;
  readonly logs: LogRow[];
  readonly currency: string;
  readonly canLog: boolean;
};

export async function UsageLogTable({
  locale,
  orgSlug,
  machineId,
  logs,
  currency,
  canLog,
}: Props) {
  const t = await getTranslations("machinery");

  const totalHours = logs
    .reduce((sum, row) => sum.add(row.log.hoursUsed), new Decimal(0))
    .toFixed(2);
  const totalCost = logs
    .reduce((sum, row) => sum.add(row.log.totalCost), new Decimal(0))
    .toFixed(4);

  if (logs.length === 0) {
    return <p className="text-muted-foreground">{t("logs.empty")}</p>;
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t("logs.table.date")}</th>
              <th className="px-4 py-3 font-medium">{t("logs.table.hours")}</th>
              <th className="px-4 py-3 font-medium">{t("logs.table.fuel")}</th>
              <th className="px-4 py-3 font-medium">{t("logs.table.cost")}</th>
              <th className="px-4 py-3 font-medium">
                {t("logs.table.operator")}
              </th>
              <th className="px-4 py-3 font-medium">{t("logs.table.linked")}</th>
              {canLog && (
                <th className="px-4 py-3 font-medium">
                  {t("logs.table.actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map((row) => (
              <tr key={row.log.id}>
                <td className="px-4 py-3">{row.log.date}</td>
                <td className="px-4 py-3">{row.log.hoursUsed}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.log.fuelLiters ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {row.log.totalCost} {currency}
                </td>
                <td className="px-4 py-3">
                  {row.operatorName ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.workOrderCode
                    ? row.workOrderCode
                    : row.activityDate
                      ? `${row.activityDate} · ${row.activityDescription ?? ""}`
                      : "—"}
                </td>
                {canLog && (
                  <td className="px-4 py-3">
                    <form action={deleteUsageLogAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="machineId" value={machineId} />
                      <input type="hidden" name="logId" value={row.log.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        {t("logs.table.delete")}
                      </Button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-4 py-3">{t("logs.table.total")}</td>
              <td className="px-4 py-3">{totalHours}</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3">
                {totalCost} {currency}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
              {canLog && <td className="px-4 py-3" />}
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}
