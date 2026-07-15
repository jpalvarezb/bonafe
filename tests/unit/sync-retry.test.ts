import { describe, expect, it } from "vitest";
import { z, ZodError } from "zod";
import {
  classifyRejection,
  discardEntry,
  editAndRetryEntry,
  retryEntry,
  type RetryableEntry,
} from "../../src/lib/offline/retry";

/**
 * Pure retry/review state machine for rejected outbox items (src/lib/offline/
 * retry.ts). A rejection must never be a dead end for a field worker: the
 * entry, its payload, and its client-generated id all survive a retry —
 * a retry is a resubmission of the SAME row, never a new one.
 */
describe("retryEntry", () => {
  const rejected: RetryableEntry = {
    id: "018f0000-0000-7000-8000-000000000201",
    status: "rejected",
    payload: { id: "018f0000-0000-7000-8000-000000000201", quantity: "10" },
    lastError: "worker not found",
    reasonCode: "not_found",
  };

  it("transitions 'rejected' -> 'pending'", () => {
    const result = retryEntry(rejected);
    expect(result.status).toBe("pending");
  });

  it("preserves the same entry id (never mints a new UUID)", () => {
    const result = retryEntry(rejected);
    expect(result.id).toBe(rejected.id);
  });

  it("preserves the same payload", () => {
    const result = retryEntry(rejected);
    expect(result.payload).toEqual(rejected.payload);
  });

  it("clears lastError and reasonCode", () => {
    const result = retryEntry(rejected);
    expect(result.lastError).toBeUndefined();
    expect(result.reasonCode).toBeUndefined();
  });

  for (const status of ["pending", "syncing", "done"] as const) {
    it(`is a no-op on an entry already in status '${status}'`, () => {
      const entry: RetryableEntry = { ...rejected, status, reasonCode: undefined, lastError: undefined };
      const result = retryEntry(entry);
      expect(result).toEqual(entry);
    });
  }
});

describe("editAndRetryEntry", () => {
  const rejected: RetryableEntry = {
    id: "018f0000-0000-7000-8000-000000000202",
    status: "rejected",
    payload: { id: "018f0000-0000-7000-8000-000000000202", quantity: "10" },
    lastError: "invalid quantity",
    reasonCode: "validation",
  };
  const updatedPayload = {
    id: "018f0000-0000-7000-8000-000000000202",
    quantity: "12.5",
  };

  it("transitions 'rejected' -> 'pending' with the updated payload", () => {
    const result = editAndRetryEntry(rejected, updatedPayload);
    expect(result.status).toBe("pending");
    expect(result.payload).toEqual(updatedPayload);
  });

  it("keeps the SAME id as the original entry (never a new UUID)", () => {
    const result = editAndRetryEntry(rejected, updatedPayload);
    expect(result.id).toBe(rejected.id);
  });

  it("clears lastError and reasonCode", () => {
    const result = editAndRetryEntry(rejected, updatedPayload);
    expect(result.lastError).toBeUndefined();
    expect(result.reasonCode).toBeUndefined();
  });

  it("does not mutate the payload's embedded id even if the edit tries to change it", () => {
    const tamperedPayload = {
      id: "018f0000-0000-7000-8000-000000000999",
      quantity: "12.5",
    };
    const result = editAndRetryEntry(rejected, tamperedPayload);
    // The outbox entry id is the source of truth for idempotency, independent
    // of whatever id happens to be embedded in the (client-controlled) payload.
    expect(result.id).toBe(rejected.id);
  });

  for (const status of ["pending", "syncing", "done"] as const) {
    it(`is a no-op/invalid on an entry already in status '${status}'`, () => {
      const entry: RetryableEntry = { ...rejected, status, reasonCode: undefined, lastError: undefined };
      const result = editAndRetryEntry(entry, updatedPayload);
      expect(result).toEqual(entry);
    });
  }
});

describe("discardEntry", () => {
  const rejected: RetryableEntry = {
    id: "018f0000-0000-7000-8000-000000000203",
    status: "rejected",
    payload: { id: "018f0000-0000-7000-8000-000000000203", quantity: "10" },
    lastError: "worker not found",
    reasonCode: "not_found",
  };

  it("is terminal: discarding a rejected entry yields status 'discarded'", () => {
    const result = discardEntry(rejected);
    expect(result.status).toBe("discarded");
  });

  it("preserves the entry id through discard", () => {
    const result = discardEntry(rejected);
    expect(result.id).toBe(rejected.id);
  });

  it("a discarded entry cannot be retried (terminal, no-op)", () => {
    const discarded = discardEntry(rejected);
    const result = retryEntry(discarded);
    expect(result).toEqual(discarded);
  });

  it("a discarded entry cannot be edit-retried (terminal, no-op)", () => {
    const discarded = discardEntry(rejected);
    const result = editAndRetryEntry(discarded, { quantity: "1" });
    expect(result).toEqual(discarded);
  });
});

describe("classifyRejection", () => {
  it("maps a ZodError to 'validation'", () => {
    const schema = z.object({ quantity: z.string().regex(/^\d+$/) });
    const parseResult = schema.safeParse({ quantity: "abc" });
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(parseResult.error).toBeInstanceOf(ZodError);
      expect(classifyRejection(parseResult.error)).toBe("validation");
    }
  });

  it("maps Error('worker not found') to 'not_found'", () => {
    expect(classifyRejection(new Error("worker not found"))).toBe(
      "not_found",
    );
  });

  it("maps an error named ReadOnlyOrgError to 'read_only'", () => {
    class ReadOnlyOrgError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ReadOnlyOrgError";
      }
    }
    expect(classifyRejection(new ReadOnlyOrgError("org is read-only"))).toBe(
      "read_only",
    );
  });

  it("maps an unrecognized error to 'unknown'", () => {
    expect(classifyRejection(new Error("connection reset"))).toBe("unknown");
    expect(classifyRejection("a plain string, not even an Error")).toBe(
      "unknown",
    );
  });
});
