import { describe, expect, it } from "vitest";
import {
  mergeChecklistCompletion,
  type ChecklistItem,
} from "../../src/lib/calc/work-order-checklist";

/**
 * Pure merge used by completeWorkOrder (src/server/services/work-orders.ts)
 * to apply an offline "workorder.complete" payload's checked-item set onto
 * the server's checklist. Monotone by design: a stale offline payload must
 * never undo a colleague's progress recorded after the payload was queued.
 */
describe("mergeChecklistCompletion", () => {
  const items = (
    overrides: Partial<ChecklistItem>[] = [],
  ): ChecklistItem[] =>
    [
      { id: "a", label: "Check sprayers", done: false },
      { id: "b", label: "Load product", done: false },
      { id: "c", label: "Verify PPE", done: true },
    ].map((item, i) => ({ ...item, ...overrides[i] }));

  it("marks checked ids as done", () => {
    const merged = mergeChecklistCompletion(items(), ["a", "b"]);
    expect(merged.map((i) => i.done)).toEqual([true, true, true]);
  });

  it("leaves unchecked ids untouched", () => {
    const merged = mergeChecklistCompletion(items(), ["a"]);
    expect(merged.find((i) => i.id === "a")?.done).toBe(true);
    expect(merged.find((i) => i.id === "b")?.done).toBe(false);
  });

  it("never un-checks an item already done server-side (monotone merge)", () => {
    // "c" is already done and is NOT in the checked set (e.g. a stale
    // offline payload captured before item c was completed by a colleague).
    const merged = mergeChecklistCompletion(items(), ["a"]);
    expect(merged.find((i) => i.id === "c")?.done).toBe(true);
  });

  it("ignores unknown ids not present in the checklist", () => {
    const merged = mergeChecklistCompletion(items(), ["does-not-exist"]);
    expect(merged.map((i) => i.done)).toEqual([false, false, true]);
  });

  it("does not mutate the input array", () => {
    const original = items();
    const snapshot = original.map((i) => ({ ...i }));
    mergeChecklistCompletion(original, ["a"]);
    expect(original).toEqual(snapshot);
  });

  it("detects completeness: incomplete when any item is unchecked", () => {
    const merged = mergeChecklistCompletion(items(), ["a"]);
    expect(merged.some((i) => !i.done)).toBe(true);
  });

  it("detects completeness: complete once every item is done", () => {
    const merged = mergeChecklistCompletion(items(), ["a", "b"]);
    expect(merged.some((i) => !i.done)).toBe(false);
  });

  it("handles an empty checklist as vacuously complete", () => {
    const merged = mergeChecklistCompletion([], ["a"]);
    expect(merged).toEqual([]);
    expect(merged.some((i) => !i.done)).toBe(false);
  });
});
