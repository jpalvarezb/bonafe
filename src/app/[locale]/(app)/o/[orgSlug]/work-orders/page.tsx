import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import {
  listMembers,
  listWorkOrders,
  parseChecklist,
  type WorkOrderStatus,
} from "@/server/services/work-orders";
import { listParcels } from "@/server/services/parcels";
import { listActiveMachines } from "@/server/services/machinery";
import {
  createWorkOrderAction,
  updateWorkOrderStatusAction,
} from "@/server/actions/work-orders";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { StatusChip } from "@/components/ui/status-chip";
import { CompleteWorkOrderCard } from "@/components/work-orders/complete-work-order-card";
import { LifecycleStepper } from "@/components/work-orders/lifecycle-stepper";
import { PendingEntries } from "@/components/offline/pending-entries";
import { cn } from "@/lib/utils";

const KNOWN_ERROR_KEYS = ["checklistIncomplete"];

// DB status -> StatusChip `wo` state (in_progress has no direct token name).
const WO_CHIP_STATE: Record<
  WorkOrderStatus,
  "draft" | "assigned" | "progress" | "done" | "cancelled"
> = {
  draft: "draft",
  assigned: "assigned",
  in_progress: "progress",
  done: "done",
  cancelled: "cancelled",
};

// Density-driven building blocks — office mode gets 28/24px sizing, field
// mode gets 56/48px glove targets, from the same className strings
// (globals.css [data-mode="field"]). Mirrors WP-A (attendance-grid /
// complete-work-order-card) so the blocks read as one system.
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";

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
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const { error } = await searchParams;
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
  const errorKey =
    error && KNOWN_ERROR_KEYS.includes(error) ? error : error ? "unknown" : null;

  // LifecycleStepper does NOT translate (StatusChip idiom) — the page hands
  // it the already-translated step labels once.
  const stepperLabels: Record<WorkOrderStatus, string> = {
    draft: t("status.draft"),
    assigned: t("status.assigned"),
    in_progress: t("status.in_progress"),
    done: t("status.done"),
    cancelled: t("status.cancelled"),
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {errorKey && <Notice variant="error">{t(`errors.${errorKey}`)}</Notice>}

      <PendingEntries orgSlug={orgSlug} kind="workorder.complete" />

      {workOrders.length === 0 ? (
        <p className="text-[length:var(--density-font-body)] text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-col rounded-[3px] border border-border">
          {workOrders.map(({ workOrder, parcelName, assigneeName, machineName }) => {
            const status = workOrder.status as WorkOrderStatus;
            const transitions = nextStatuses(
              status,
              workOrder.assignedToMemberId !== null,
            );
            const checklist = parseChecklist(workOrder.config);
            const checklistDone = checklist.filter((item) => item.done).length;
            // Offline-capable completion card takes over both the
            // checklist toggles and the "Completar" transition for rows
            // it can act on; other transitions (assign/start/cancel) stay
            // as the existing online-only server-action forms below.
            const showCompleteCard =
              canComplete &&
              (status === "assigned" || status === "in_progress");
            return (
              <div
                key={workOrder.id}
                className={cn(
                  "flex flex-col gap-4 border-b border-border last:border-b-0",
                  CELL,
                )}
              >
                <div className="flex min-h-[var(--density-row-h)] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[length:var(--density-font-body)] font-semibold">
                      {workOrder.code}
                    </span>
                    <span className="truncate text-[length:var(--density-font-body)] font-medium">
                      {workOrder.title}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      family="wo"
                      state={WO_CHIP_STATE[status]}
                      className={status === "cancelled" ? "line-through" : undefined}
                    >
                      {t(`status.${status}`)}
                    </StatusChip>
                    {transitions.map((next) => {
                      // The completion card below owns "done" for rows it
                      // handles — skip the plain online-only form here.
                      if (next === "done" && showCompleteCard) return null;
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
                          <button
                            type="submit"
                            className={cn(
                              "h-[var(--density-control-h)] rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted",
                              next === "cancelled" && "text-muted-foreground",
                            )}
                          >
                            {t(`transition.${next}`)}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </div>

                {workOrder.instructions && (
                  <p className="text-[length:var(--density-font-body)] leading-snug text-muted-foreground">
                    {workOrder.instructions}
                  </p>
                )}

                {/* Board-1h detail grid: PARCELA / RESPONSABLE / PROGRAMADA /
                    TIPO. `listWorkOrders` joins names only (no farmId), so
                    the parcel stays plain text — the farm-scoped parcel route
                    can't be built without a new query. */}
                <div className="grid grid-cols-2 rounded-[3px] border border-border">
                  <div className={cn(CELL, "border-r border-b border-border")}>
                    <p className={MICRO_LABEL}>{t("parcel")}</p>
                    <p className="mt-0.5 text-[length:var(--density-font-body)]">
                      {parcelName ?? t("noParcel")}
                    </p>
                  </div>
                  <div className={cn(CELL, "border-b border-border")}>
                    <p className={MICRO_LABEL}>{t("assignee")}</p>
                    <p className="mt-0.5 text-[length:var(--density-font-body)]">
                      {assigneeName ?? t("unassigned")}
                    </p>
                  </div>
                  <div className={cn(CELL, "border-r border-border")}>
                    <p className={MICRO_LABEL}>{t("scheduledDate")}</p>
                    <p className="tabular mt-0.5 font-mono text-[length:var(--density-font-body)]">
                      {workOrder.scheduledDate ?? "—"}
                    </p>
                  </div>
                  <div className={CELL}>
                    <p className={MICRO_LABEL}>{t("type")}</p>
                    <p className="mt-0.5 text-[length:var(--density-font-body)]">
                      {workOrder.type === "machine"
                        ? t("typeMachine")
                        : t("typeField")}
                      {workOrder.type === "machine" && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {machineName ?? tm("workOrderNoMachine")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <LifecycleStepper status={status} labels={stepperLabels} />

                {showCompleteCard ? (
                  <CompleteWorkOrderCard
                    orgSlug={orgSlug}
                    locale={locale}
                    workOrder={{
                      id: workOrder.id,
                      code: workOrder.code,
                      title: workOrder.title,
                      status,
                    }}
                    checklist={checklist}
                  />
                ) : (
                  checklist.length > 0 && (
                    <div className="flex flex-col rounded-[3px] border border-border">
                      <div
                        className={cn(
                          CELL,
                          "flex items-baseline justify-between border-b border-border",
                        )}
                      >
                        <span className={MICRO_LABEL}>
                          {t("checklist.title")}
                        </span>
                        <span className="tabular font-mono text-[length:var(--density-font-label)] text-muted-foreground">
                          {checklistDone} / {checklist.length}
                        </span>
                      </div>
                      {checklist.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            CELL,
                            "flex min-h-[var(--density-row-h)] items-center gap-3 border-b border-border text-[length:var(--density-font-body)] last:border-b-0",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-[calc(var(--density-control-h)*0.55)] shrink-0 items-center justify-center rounded-[3px] border-2 font-mono",
                              item.done
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-transparent",
                            )}
                          >
                            ✓
                          </span>
                          <span
                            className={
                              item.done
                                ? "text-muted-foreground line-through"
                                : ""
                            }
                          >
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {canUpdate && (
        <section className="flex flex-col rounded-[3px] border border-border">
          <div className={cn(CELL, "border-b border-border")}>
            <h2 className={MICRO_LABEL}>{t("new")}</h2>
          </div>
          <form
            action={createWorkOrderAction}
            className="grid gap-4 p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="title" className={MICRO_LABEL}>
                {t("titleField")}
              </Label>
              <Input
                id="title"
                name="title"
                required
                placeholder={t("titlePlaceholder")}
                className={CONTROL}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="type" className={MICRO_LABEL}>
                {t("type")}
              </Label>
              <select
                id="type"
                name="type"
                defaultValue="field"
                className={CONTROL}
              >
                <option value="field">{t("typeField")}</option>
                <option value="machine">{t("typeMachine")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="parcelId" className={MICRO_LABEL}>
                {t("parcel")}
              </Label>
              <select
                id="parcelId"
                name="parcelId"
                defaultValue=""
                className={CONTROL}
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
              <Label htmlFor="machineId" className={MICRO_LABEL}>
                {tm("workOrderMachine")}
              </Label>
              <select
                id="machineId"
                name="machineId"
                defaultValue=""
                className={CONTROL}
              >
                <option value="">{tm("workOrderNoMachine")}</option>
                {activeMachines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </select>
              <p className="text-[length:var(--density-font-label)] text-muted-foreground">
                {tm("workOrderMachineHint")}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="assignedToMemberId" className={MICRO_LABEL}>
                {t("assignee")}
              </Label>
              <select
                id="assignedToMemberId"
                name="assignedToMemberId"
                defaultValue=""
                className={CONTROL}
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
              <Label htmlFor="scheduledDate" className={MICRO_LABEL}>
                {t("scheduledDate")}
              </Label>
              <Input
                id="scheduledDate"
                name="scheduledDate"
                type="date"
                className={cn(CONTROL, "tabular font-mono")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="instructions" className={MICRO_LABEL}>
                {t("instructions")}
              </Label>
              <Input
                id="instructions"
                name="instructions"
                placeholder={t("instructionsPlaceholder")}
                className={CONTROL}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="checklistText" className={MICRO_LABEL}>
                {t("checklist.field")}
              </Label>
              <textarea
                id="checklistText"
                name="checklistText"
                rows={4}
                placeholder={t("checklist.placeholder")}
                className="rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] py-[var(--density-cell-py)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-[length:var(--density-font-label)] text-muted-foreground">
                {t("checklist.hint")}
              </p>
            </div>
            <button
              type="submit"
              className="h-[var(--density-control-h)] self-end justify-self-start rounded-[3px] bg-foreground px-6 text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90"
            >
              {t("create")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
