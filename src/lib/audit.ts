import { db } from "./db";
import { auditLog } from "./db/schema";
import type { OrgContext } from "./tenancy";

/**
 * Appends one audit-trail row. Fire-and-forget by design: an audit failure
 * must never break the underlying mutation, so callers `await` it but any
 * error is swallowed after a console warning.
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
    await db.insert(auditLog).values({
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
    });
  } catch (error) {
    console.warn("audit log write failed", action, error);
  }
}
