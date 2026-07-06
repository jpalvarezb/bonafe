import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Domain permission statements. Org/member/invitation management statements
 * come from Better Auth's defaults; the rest are AgroPeq domain resources.
 */
export const statement = {
  ...defaultStatements,
  farm: ["create", "update", "delete"],
  parcel: ["create", "update", "delete"],
  cycle: ["create", "update", "delete"],
  activity: ["create", "update", "delete"],
  monitoring: ["create", "update", "delete"],
  climate: ["create", "update", "delete"],
  work_order: ["create", "update", "delete", "complete"],
  cost_center: ["manage"],
  catalog: ["manage"],
  settings: ["manage"],
  report: ["view"],
  worker: ["manage"],
  attendance: ["create", "update", "delete"],
  payroll: ["manage"],
  harvest: ["create", "update", "delete"],
  inventory: ["manage"],
  purchase: ["create", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

const fullDomain = {
  farm: ["create", "update", "delete"],
  parcel: ["create", "update", "delete"],
  cycle: ["create", "update", "delete"],
  activity: ["create", "update", "delete"],
  monitoring: ["create", "update", "delete"],
  climate: ["create", "update", "delete"],
  work_order: ["create", "update", "delete", "complete"],
  cost_center: ["manage"],
  catalog: ["manage"],
  settings: ["manage"],
  report: ["view"],
  worker: ["manage"],
  attendance: ["create", "update", "delete"],
  payroll: ["manage"],
  harvest: ["create", "update", "delete"],
  inventory: ["manage"],
  purchase: ["create", "update", "delete"],
} as const;

export const owner = ac.newRole({
  ...ownerAc.statements,
  ...fullDomain,
});

export const admin = ac.newRole({
  ...adminAc.statements,
  ...fullDomain,
});

export const manager = ac.newRole({
  farm: ["create", "update"],
  parcel: ["create", "update"],
  cycle: ["create", "update", "delete"],
  activity: ["create", "update", "delete"],
  monitoring: ["create", "update", "delete"],
  climate: ["create", "update", "delete"],
  work_order: ["create", "update", "complete"],
  cost_center: ["manage"],
  catalog: ["manage"],
  report: ["view"],
  worker: ["manage"],
  attendance: ["create", "update", "delete"],
  payroll: ["manage"],
  harvest: ["create", "update", "delete"],
  inventory: ["manage"],
  purchase: ["create", "update", "delete"],
});

export const fieldSupervisor = ac.newRole({
  activity: ["create", "update"],
  monitoring: ["create", "update"],
  climate: ["create"],
  work_order: ["complete"],
  attendance: ["create", "update"],
  harvest: ["create"],
});

export const roles = {
  owner,
  admin,
  manager,
  field_supervisor: fieldSupervisor,
} as const;

export type OrgRole = keyof typeof roles;
export const ORG_ROLES = Object.keys(roles) as OrgRole[];
