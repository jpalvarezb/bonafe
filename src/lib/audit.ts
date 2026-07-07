import { withOrgRls } from "./db/rls";
import { auditLog } from "./db/schema";
import type { OrgContext } from "./tenancy";

/**
 * Appends one audit-trail row. Fire-and-forget by design: an audit failure
 * must never break the underlying mutation, so callers `await` it but any
 * error is swallowed after a console warning.
 *
 * Called from OUTSIDE the mutating service's own transaction (actions call
 * `await someService(...)` then separately `await audit(...)`), so wrapping
 * this in its own withOrgRls is a sequential transaction, never nested
 * inside another one. audit_log is RLS'd (org_id NOT NULL) — without this
 * wrap, agropeq_app would fail closed on the insert and this catch block
 * would silently swallow the RLS violation, killing the audit trail with
 * no visible symptom.
 */
export async function audit(
  ctx: OrgContext,
  action: string,
  options?: {
    entity?: string;
    entityId?: string;
    /** Small, non-sensitive context only — names/amounts, never secrets. */
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await withOrgRls(ctx.org.id, (tx) =>
      tx.insert(auditLog).values({
        orgId: ctx.org.id,
        actorUserId: ctx.user.id,
        // Snapshot the actor's current name/email so the trail stays
        // readable even after the user is renamed or removed.
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        action,
        entity: options?.entity ?? null,
        entityId: options?.entityId ?? null,
        meta: options?.meta ?? {},
      }),
    );
  } catch (error) {
    console.warn("audit log write failed", action, error);
  }
}
