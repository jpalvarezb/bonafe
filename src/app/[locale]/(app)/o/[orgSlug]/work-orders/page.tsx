import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import {
  listMembers,
  listWorkOrders,
  type WorkOrderStatus,
} from "@/server/services/work-orders";
import { listParcels } from "@/server/services/parcels";
import { listActiveMachines } from "@/server/services/machinery";
import {
  createWorkOrderAction,
  updateWorkOrderStatusAction,
} from "@/server/actions/work-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_CHIP_CLASS: Record<WorkOrderStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  assigned:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  in_progress:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  cancelled: "bg-muted text-muted-foreground line-through",
};

/** Next statuses reachable from `status`, per the allowed transition set. */
function nextStatuses(
  status: WorkOrderStatus,
  hasAssignee: boolean,
): WorkOrderStatus[] {
  if (status === "done" || status === "cancelled") return [];
  const next: WorkOrderStatus[] = [];
  if (status === "draft" && hasAssignee) next.push("assigned");
  if (status === "assigned") next.push("in_progress");
  if (status === "in_progress") next.push("done");
  next.push("cancelled");
  return next;
}

export default async function WorkOrdersPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("workorders");
  // Machine-select strings live in the machinery namespace, which this agent
  // owns; workorders.json stays untouched.
  const tm = await getTranslations("machinery");

  const [workOrders, parcels, members, activeMachines] = await Promise.all([
    listWorkOrders(ctx),
    listParcels(ctx),
    listMembers(ctx),
    listActiveMachines(ctx),
  ]);

  const canUpdate = can(ctx.role, "work_order", "update");
  const canComplete = can(ctx.role, "work_order", "complete");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {workOrders.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {workOrders.map(({ workOrder, parcelName, assigneeName, machineName }) => {
              const status = workOrder.status as WorkOrderStatus;
              const transitions = nextStatuses(
                status,
                workOrder.assignedToMemberId !== null,
              );
              return (
                <div
                  key={workOrder.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      <span className="text-muted-foreground">
                        {workOrder.code}
                      </span>{" "}
                      · {workOrder.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {parcelName ?? t("noParcel")} ·{" "}
                      {assigneeName ?? t("unassigned")}
                      {workOrder.type === "machine"
                        ? ` · ${machineName ?? tm("workOrderNoMachine")}`
                        : ""}
                      {workOrder.scheduledDate
                        ? ` · ${workOrder.scheduledDate}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIP_CLASS[status]}`}
                    >
                      {t(`status.${status}`)}
                    </span>
                    {transitions.map((next) => {
                      const gated =
                        next === "done" ? canComplete : canUpdate;
                      if (!gated) return null;
                      return (
                        <form key={next} action={updateWorkOrderStatusAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input
                            type="hidden"
                            name="orgSlug"
                            value={orgSlug}
                          />
                          <input
                            type="hidden"
                            name="id"
                            value={workOrder.id}
                          />
                          <input type="hidden" name="status" value={next} />
                          <Button variant="ghost" size="sm" type="submit">
                            {t(`transition.${next}`)}
                          </Button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {canUpdate && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createWorkOrderAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">{t("titleField")}</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  placeholder={t("titlePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="type">{t("type")}</Label>
                <select
                  id="type"
                  name="type"
                  defaultValue="field"
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="field">{t("typeField")}</option>
                  <option value="machine">{t("typeMachine")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="parcelId">{t("parcel")}</Label>
                <select
                  id="parcelId"
                  name="parcelId"
                  defaultValue=""
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">{t("noParcel")}</option>
                  {parcels.map((parcel) => (
                    <option key={parcel.id} value={parcel.id}>
                      {parcel.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="machineId">{tm("workOrderMachine")}</Label>
                <select
                  id="machineId"
                  name="machineId"
                  defaultValue=""
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">{tm("workOrderNoMachine")}</option>
                  {activeMachines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {tm("workOrderMachineHint")}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="assignedToMemberId">{t("assignee")}</Label>
                <select
                  id="assignedToMemberId"
                  name="assignedToMemberId"
                  defaultValue=""
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">{t("unassigned")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="scheduledDate">{t("scheduledDate")}</Label>
                <Input id="scheduledDate" name="scheduledDate" type="date" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="instructions">{t("instructions")}</Label>
                <Input
                  id="instructions"
                  name="instructions"
                  placeholder={t("instructionsPlaceholder")}
                />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("create")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
