export const ROLE_ACCESS_MODULES = [
  'job_management',
  'vehicle_customer',
  'appointments',
  'payments',
  'vehicle_records',
  'file_processing',
  'rop_integration',
  'user_roles',
  'reports_analytics',
] as const;

export type RoleAccessModule = (typeof ROLE_ACCESS_MODULES)[number];

export type ModuleCrudFlags = {
  create: boolean;
  edit: boolean;
  view: boolean;
};

export type RoleAccessMatrix = Record<RoleAccessModule, ModuleCrudFlags>;

export function createEmptyRoleAccessMatrix(): RoleAccessMatrix {
  return ROLE_ACCESS_MODULES.reduce((acc, module) => {
    acc[module] = { create: false, edit: false, view: false };
    return acc;
  }, {} as RoleAccessMatrix);
}
