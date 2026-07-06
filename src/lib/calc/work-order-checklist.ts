export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

/**
 * Pure monotone merge used by completeWorkOrder (offline "workorder.complete"
 * outbox kind) to apply a checked-item set onto the server's checklist:
 * marks every item whose id is in `checkedItemIds` as done. Never un-checks
 * an item that is already done server-side — a stale offline payload
 * (captured before a colleague finished more items) must not regress their
 * progress. Ids not present in `checklist` are silently ignored (e.g. a
 * stale client checklist snapshot).
 */
export function mergeChecklistCompletion(
  checklist: ChecklistItem[],
  checkedItemIds: readonly string[],
): ChecklistItem[] {
  const checked = new Set(checkedItemIds);
  return checklist.map((item) =>
    item.done || checked.has(item.id) ? { ...item, done: true } : item,
  );
}
