import { roles, type OrgRole } from "./auth/permissions";
import type { OrgContext } from "./tenancy";

type Statements = Record<string, readonly string[]>;

/** Checks the role→permission matrix defined in auth/permissions.ts. */
export function can(role: OrgRole, resource: string, action: string): boolean {
  const roleDef = roles[role];
  if (!roleDef) return false;
  const actions = (roleDef.statements as Statements)[resource];
  return actions?.includes(action) ?? false;
}

export class ReadOnlyOrgError extends Error {
  constructor(status: string) {
    super(`organization is read-only (subscription ${status})`);
    this.name = "ReadOnlyOrgError";
  }
}

/**
 * Degraded-billing mode: past_due/canceled orgs keep read access and can
 * still manage settings (to fix billing) and members, but every domain
 * mutation is refused. assertCan is the single choke point every mutating
 * service already goes through, so the rule is enforced globally here.
 */
const READ_ONLY_ALLOWED_RESOURCES = new Set([
  "settings",
  "member",
  "invitation",
  "organization",
]);

function assertOrgWritable(
  ctx: OrgContext,
  resource: string,
  action: string,
): void {
  if (ctx.subscriptionStatus !== "past_due" && ctx.subscriptionStatus !== "canceled") {
    return;
  }
  if (action === "view" || READ_ONLY_ALLOWED_RESOURCES.has(resource)) return;
  throw new ReadOnlyOrgError(ctx.subscriptionStatus);
}

/** Throws when the member lacks a permission — use in server actions/services. */
export function assertCan(
  ctx: OrgContext,
  resource: string,
  action: string,
): void {
  if (!can(ctx.role, resource, action)) {
    throw new Error(`forbidden: ${ctx.role} cannot ${action} ${resource}`);
  }
  assertOrgWritable(ctx, resource, action);
}
