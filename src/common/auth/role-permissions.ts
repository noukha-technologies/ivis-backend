import { ALL_PERMISSION_KEYS, PermissionKey, PermissionKeys } from '../constants/permissions';
import { USER_ROLES } from '../enums/common.enums';
import {
  createEmptyRoleAccessMatrix,
  type ModuleCrudFlags,
  type RoleAccessMatrix,
  type RoleAccessModule,
  ROLE_ACCESS_MODULES,
} from '../types/role-access.types';

const FULL_ACCESS_ROLES = new Set([
  USER_ROLES.ADMIN,
  USER_ROLES.SYSTEM_ADMIN,
  USER_ROLES.CLIENT_ADMIN,
]);

const RECEPTIONIST_PERMISSIONS: string[] = [
  PermissionKeys.DASHBOARD_VIEW,
  PermissionKeys.APPOINTMENTS_CREATE,
  PermissionKeys.APPOINTMENTS_VIEW,
  PermissionKeys.APPOINTMENTS_UPSERT,
  PermissionKeys.PAYMENTS_CREATE,
  PermissionKeys.PAYMENTS_VIEW,
  PermissionKeys.PAYMENTS_UPSERT,
  PermissionKeys.ANPR_CREATE,
  PermissionKeys.ANPR_VIEW,
  PermissionKeys.ROP_VIEW,
  PermissionKeys.VEHICLE_RECORDS_VIEW,
  PermissionKeys.CUSTOMERS_CREATE,
  PermissionKeys.CUSTOMERS_VIEW,
  PermissionKeys.CUSTOMERS_UPSERT,
  PermissionKeys.JOBS_VIEW,
];

const TECHNICIAN_PERMISSIONS: string[] = [
  PermissionKeys.DASHBOARD_VIEW,
  PermissionKeys.JOBS_CREATE,
  PermissionKeys.JOBS_VIEW,
  PermissionKeys.JOBS_UPSERT,
  PermissionKeys.ANPR_VIEW,
  PermissionKeys.ROP_VIEW,
  PermissionKeys.VEHICLE_RECORDS_VIEW,
];

type ModulePermissionMap = {
  create: PermissionKey[];
  edit: PermissionKey[];
  view: PermissionKey[];
};

export const MODULE_PERMISSION_MAP: Record<RoleAccessModule, ModulePermissionMap> = {
  job_management: {
    view: [PermissionKeys.JOBS_VIEW],
    create: [PermissionKeys.JOBS_CREATE],
    edit: [PermissionKeys.JOBS_UPSERT, PermissionKeys.JOBS_DELETE],
  },
  vehicle_customer: {
    view: [PermissionKeys.CUSTOMERS_VIEW, PermissionKeys.ANPR_VIEW],
    create: [PermissionKeys.CUSTOMERS_CREATE, PermissionKeys.ANPR_CREATE],
    edit: [
      PermissionKeys.CUSTOMERS_UPSERT,
      PermissionKeys.CUSTOMERS_DELETE,
      PermissionKeys.ANPR_UPSERT,
      PermissionKeys.ANPR_DELETE,
    ],
  },
  appointments: {
    view: [PermissionKeys.APPOINTMENTS_VIEW],
    create: [PermissionKeys.APPOINTMENTS_CREATE],
    edit: [PermissionKeys.APPOINTMENTS_UPSERT, PermissionKeys.APPOINTMENTS_DELETE],
  },
  payments: {
    view: [PermissionKeys.PAYMENTS_VIEW],
    create: [PermissionKeys.PAYMENTS_CREATE],
    edit: [PermissionKeys.PAYMENTS_UPSERT, PermissionKeys.PAYMENTS_DELETE],
  },
  vehicle_records: {
    view: [PermissionKeys.VEHICLE_RECORDS_VIEW],
    create: [PermissionKeys.VEHICLE_RECORDS_CREATE],
    edit: [PermissionKeys.VEHICLE_RECORDS_UPSERT, PermissionKeys.VEHICLE_RECORDS_DELETE],
  },
  file_processing: {
    view: [PermissionKeys.FILE_PROCESSING_VIEW],
    create: [],
    edit: [],
  },
  rop_integration: {
    view: [PermissionKeys.ROP_VIEW],
    create: [PermissionKeys.ROP_CREATE],
    edit: [PermissionKeys.ROP_UPSERT, PermissionKeys.ROP_DELETE],
  },
  user_roles: {
    view: [
      PermissionKeys.USER_VIEW,
      PermissionKeys.ROLES_VIEW,
      PermissionKeys.PERMISSIONS_VIEW,
      PermissionKeys.MASTERS_VIEW,
    ],
    create: [
      PermissionKeys.USER_CREATE,
      PermissionKeys.ROLES_CREATE,
      PermissionKeys.PERMISSIONS_CREATE,
      PermissionKeys.MASTERS_CREATE,
    ],
    edit: [
      PermissionKeys.USER_EDIT,
      PermissionKeys.USER_DELETE,
      PermissionKeys.ROLES_UPSERT,
      PermissionKeys.ROLES_DELETE,
      PermissionKeys.PERMISSIONS_UPSERT,
      PermissionKeys.PERMISSIONS_DELETE,
      PermissionKeys.MASTERS_UPSERT,
      PermissionKeys.MASTERS_DELETE,
    ],
  },
  reports_analytics: {
    view: [
      PermissionKeys.DASHBOARD_VIEW,
      PermissionKeys.REPORTS_VIEW,
      PermissionKeys.CONFIGURATION_VIEW,
    ],
    create: [],
    edit: [],
  },
};

function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

function hasAnyKey(flatKeys: Set<string>, keys: PermissionKey[]): boolean {
  return keys.some((key) => flatKeys.has(key));
}

/** Fallback flat keys when role is not in core.role_access (legacy / seed defaults). */
export function resolvePermissionsForRole(role: string): string[] {
  const normalized = normalizeRole(role);

  if (FULL_ACCESS_ROLES.has(role as USER_ROLES)) {
    return ALL_PERMISSION_KEYS;
  }

  if (normalized === 'receptionist') {
    return RECEPTIONIST_PERMISSIONS;
  }

  if (normalized === 'technician') {
    return TECHNICIAN_PERMISSIONS;
  }

  return [PermissionKeys.USER_VIEW];
}

export function matrixFromFlatPermissions(flatKeys: string[]): RoleAccessMatrix {
  const keySet = new Set(flatKeys);
  const matrix = createEmptyRoleAccessMatrix();

  for (const module of ROLE_ACCESS_MODULES) {
    const map = MODULE_PERMISSION_MAP[module];
    matrix[module] = {
      view: hasAnyKey(keySet, map.view),
      create: hasAnyKey(keySet, map.create),
      edit: hasAnyKey(keySet, map.edit),
    };
  }

  return matrix;
}

/** DB role_access.access JSON → flat keys for guards. */
export function resolveFlatPermissionsFromMatrix(matrix: RoleAccessMatrix): string[] {
  const resolved = new Set<string>();

  for (const module of ROLE_ACCESS_MODULES) {
    const flags = matrix[module];
    const map = MODULE_PERMISSION_MAP[module];

    if (flags.view) {
      map.view.forEach((key) => resolved.add(key));
    }
    if (flags.create) {
      map.create.forEach((key) => resolved.add(key));
    }
    if (flags.edit) {
      map.edit.forEach((key) => resolved.add(key));
    }
  }

  return [...resolved];
}

export function normalizeRoleAccessMatrix(
  partial: Partial<Record<RoleAccessModule, Partial<ModuleCrudFlags>>>,
): RoleAccessMatrix {
  const matrix = createEmptyRoleAccessMatrix();

  for (const module of ROLE_ACCESS_MODULES) {
    const flags = partial[module];
    if (flags) {
      matrix[module] = {
        create: Boolean(flags.create),
        edit: Boolean(flags.edit),
        view: Boolean(flags.view),
      };
    }
  }

  return matrix;
}
