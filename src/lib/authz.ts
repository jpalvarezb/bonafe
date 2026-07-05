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

/** Throws when the member lacks a permission — use in server actions/services. */
export function assertCan(
  ctx: OrgContext,
  resource: string,
  action: string,
): void {
  if (!can(ctx.role, resource, action)) {
    throw new Error(`forbidden: ${ctx.role} cannot ${action} ${resource}`);
  }
}
