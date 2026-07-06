import { getTranslations } from "next-intl/server";
import { createUsageLogAction } from "@/server/actions/machinery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Option = { id: string; label: string };

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly machineId: string;
  readonly activities: Option[];
  readonly workOrders: Option[];
  readonly operators: Option[];
};

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function UsageLogForm({
  locale,
  orgSlug,
  machineId,
  activities,
  workOrders,
  operators,
}: Props) {
  const t = await getTranslations("machinery");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("logs.new")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={createUsageLogAction}
          className="grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="machineId" value={machineId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="date">{t("logs.date")}</Label>
            <Input id="date" name="date" type="date" defaultValue={today()} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hoursUsed">{t("logs.hoursUsed")}</Label>
            <Input
              id="hoursUsed"
              name="hoursUsed"
              inputMode="decimal"
              pattern="^\d{1,12}(\.\d{1,8})?$"
              placeholder="0.00"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fuelLiters">{t("logs.fuelLiters")}</Label>
            <Input
              id="fuelLiters"
              name="fuelLiters"
              inputMode="decimal"
              pattern="^\d{1,12}(\.\d{1,8})?$"
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fuelCost">{t("logs.fuelCost")}</Label>
            <Input
              id="fuelCost"
              name="fuelCost"
              inputMode="decimal"
              pattern="^\d{1,12}(\.\d{1,8})?$"
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="activityId">{t("logs.activity")}</Label>
            <select id="activityId" name="activityId" defaultValue="" className={selectClass}>
              <option value="">{t("logs.noActivity")}</option>
              {activities.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="workOrderId">{t("logs.workOrder")}</Label>
            <select id="workOrderId" name="workOrderId" defaultValue="" className={selectClass}>
              <option value="">{t("logs.noWorkOrder")}</option>
              {workOrders.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="operatorWorkerId">{t("logs.operator")}</Label>
            <select
              id="operatorWorkerId"
              name="operatorWorkerId"
              defaultValue=""
              className={selectClass}
            >
              <option value="">{t("logs.noOperator")}</option>
              {operators.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">{t("logs.notes")}</Label>
            <Input id="notes" name="notes" />
          </div>

          <Button type="submit" className="self-end justify-self-start">
            {t("logs.create")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
