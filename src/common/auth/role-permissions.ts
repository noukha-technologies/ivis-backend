import { ALL_PERMISSION_KEYS, PermissionKey, PermissionKeys } from '../constants/permissions';
import { USER_ROLES } from '../enums/common.enums';
import {
  APPOINTMENTS_SUBMODULES,
  createEmptyRoleAccessMatrix,
  FLAT_MODULES,
  MASTER_MANAGEMENT_SUBMODULES,
  type ModuleCrudFlags,
  type ModuleWithSubmodules,
  type RoleAccessMatrix,
  SUBMODULE_MODULES,
  TRANSACTIONS_SUBMODULES,
  USER_MANAGEMENT_SUBMODULES,
} from '../types/role-access.types';

const FULL_ACCESS_ROLES = new Set<string>([
  USER_ROLES.ADMIN,
  USER_ROLES.SYSTEM_ADMIN,
  USER_ROLES.CLIENT_ADMIN,
  'super_admin',
  'super admin',
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

type FlatModulePermissionMap = {
  create: PermissionKey[];
  edit: PermissionKey[];
  view: PermissionKey[];
};

type SubmodulePermissionMap = FlatModulePermissionMap & {
  submodules: Record<string, FlatModulePermissionMap>;
};

type ModulePermissionEntry = FlatModulePermissionMap | SubmodulePermissionMap;

export const MODULE_PERMISSION_MAP: Record<string, ModulePermissionEntry> = {
  // ── Flat modules ────────────────────────────────────────────────────────────
  dashboard: {
    view: [PermissionKeys.DASHBOARD_VIEW],
    create: [],
    edit: [],
  },
  job_management: {
    view: [PermissionKeys.JOBS_VIEW],
    create: [PermissionKeys.JOBS_CREATE],
    edit: [PermissionKeys.JOBS_UPSERT, PermissionKeys.JOBS_DELETE],
  },
  reports_analytics: {
    view: [PermissionKeys.REPORTS_VIEW],
    create: [],
    edit: [],
  },
  configuration: {
    view: [PermissionKeys.CONFIGURATION_VIEW],
    create: [PermissionKeys.CONFIGURATION_UPSERT],
    edit: [PermissionKeys.CONFIGURATION_UPSERT],
  },

  // ── Submodule modules ────────────────────────────────────────────────────────
  appointments: {
    // Parent create/edit are resolved at this level; view is derived from submodules
    view: [],
    create: [PermissionKeys.APPOINTMENTS_CREATE],
    edit: [PermissionKeys.APPOINTMENTS_UPSERT, PermissionKeys.APPOINTMENTS_DELETE],
    submodules: {
      list_view: { view: [PermissionKeys.APPOINTMENTS_VIEW], create: [], edit: [] },
      calendar_view: { view: [PermissionKeys.APPOINTMENTS_VIEW], create: [], edit: [] },
    },
  },
  master_management: {
    view: [],
    create: [],
    edit: [],
    submodules: {
      vehicle: { view: [PermissionKeys.MASTERS_VIEW], create: [PermissionKeys.MASTERS_CREATE], edit: [PermissionKeys.MASTERS_UPSERT, PermissionKeys.MASTERS_DELETE] },
      center: { view: [PermissionKeys.MASTERS_VIEW], create: [PermissionKeys.MASTERS_CREATE], edit: [PermissionKeys.MASTERS_UPSERT, PermissionKeys.MASTERS_DELETE] },
      line: { view: [PermissionKeys.MASTERS_VIEW], create: [PermissionKeys.MASTERS_CREATE], edit: [PermissionKeys.MASTERS_UPSERT, PermissionKeys.MASTERS_DELETE] },
      admin_pc: { view: [PermissionKeys.MASTERS_VIEW], create: [PermissionKeys.MASTERS_CREATE], edit: [PermissionKeys.MASTERS_UPSERT, PermissionKeys.MASTERS_DELETE] },
      camera_anpr: { view: [PermissionKeys.ANPR_VIEW], create: [PermissionKeys.ANPR_CREATE], edit: [PermissionKeys.ANPR_UPSERT, PermissionKeys.ANPR_DELETE] },
      charges: { view: [PermissionKeys.MASTERS_VIEW], create: [PermissionKeys.MASTERS_CREATE], edit: [PermissionKeys.MASTERS_UPSERT, PermissionKeys.MASTERS_DELETE] },
    },
  },
  transactions: {
    view: [],
    create: [],
    edit: [],
    submodules: {
      payments: { view: [PermissionKeys.PAYMENTS_VIEW], create: [PermissionKeys.PAYMENTS_CREATE], edit: [PermissionKeys.PAYMENTS_UPSERT, PermissionKeys.PAYMENTS_DELETE] },
      vehicle_records: { view: [PermissionKeys.VEHICLE_RECORDS_VIEW], create: [PermissionKeys.VEHICLE_RECORDS_CREATE], edit: [PermissionKeys.VEHICLE_RECORDS_UPSERT, PermissionKeys.VEHICLE_RECORDS_DELETE] },
      customers: { view: [PermissionKeys.CUSTOMERS_VIEW], create: [PermissionKeys.CUSTOMERS_CREATE], edit: [PermissionKeys.CUSTOMERS_UPSERT, PermissionKeys.CUSTOMERS_DELETE] },
      file_processing: { view: [PermissionKeys.FILE_PROCESSING_VIEW], create: [], edit: [] },
      rop_management: { view: [PermissionKeys.ROP_VIEW], create: [PermissionKeys.ROP_CREATE], edit: [PermissionKeys.ROP_UPSERT, PermissionKeys.ROP_DELETE] },
    },
  },
  user_management: {
    view: [],
    create: [],
    edit: [],
    submodules: {
      users: { view: [PermissionKeys.USER_VIEW], create: [PermissionKeys.USER_CREATE], edit: [PermissionKeys.USER_EDIT, PermissionKeys.USER_DELETE] },
      roles: { view: [PermissionKeys.ROLES_VIEW], create: [PermissionKeys.ROLES_CREATE], edit: [PermissionKeys.ROLES_UPSERT, PermissionKeys.ROLES_DELETE] },
      permissions: { view: [PermissionKeys.PERMISSIONS_VIEW], create: [PermissionKeys.PERMISSIONS_CREATE], edit: [PermissionKeys.PERMISSIONS_UPSERT, PermissionKeys.PERMISSIONS_DELETE] },
    },
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

  if (FULL_ACCESS_ROLES.has(normalized.replace(/ /g, '_')) || FULL_ACCESS_ROLES.has(normalized)) {
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

/** DB permission.access JSON → flat keys for guards. */
export function resolveFlatPermissionsFromMatrix(matrix: RoleAccessMatrix): string[] {
  const resolved = new Set<string>();

  // Flat modules
  for (const mod of FLAT_MODULES) {
    const flags = matrix[mod];
    const map = MODULE_PERMISSION_MAP[mod] as FlatModulePermissionMap;

    if (flags.view) map.view.forEach((k) => resolved.add(k));
    if (flags.create) map.create.forEach((k) => resolved.add(k));
    if (flags.edit) map.edit.forEach((k) => resolved.add(k));
  }

  // Submodule modules: parent view = false → suppress all submodule keys
  for (const mod of SUBMODULE_MODULES) {
    const modFlags = matrix[mod] as ModuleWithSubmodules<string>;
    if (!modFlags.view) continue;

    const entry = MODULE_PERMISSION_MAP[mod] as SubmodulePermissionMap;

    // Parent-level create/edit (e.g. appointments.create → APPOINTMENTS_CREATE)
    if (modFlags.create) entry.create.forEach((k) => resolved.add(k));
    if (modFlags.edit) entry.edit.forEach((k) => resolved.add(k));

    // Submodule-level flags
    for (const sub of Object.keys(entry.submodules)) {
      const sf = modFlags.submodules[sub];
      const sm = entry.submodules[sub];

      if (sf.view) sm.view.forEach((k) => resolved.add(k));
      if (sf.create) sm.create.forEach((k) => resolved.add(k));
      if (sf.edit) sm.edit.forEach((k) => resolved.add(k));
    }
  }

  return [...resolved];
}

/** Flat keys → RoleAccessMatrix (used for admin bootstrap and matrixFromFlatPermissions). */
export function matrixFromFlatPermissions(flatKeys: string[]): RoleAccessMatrix {
  const keySet = new Set(flatKeys);
  const matrix = createEmptyRoleAccessMatrix();

  // Flat modules
  for (const mod of FLAT_MODULES) {
    const map = MODULE_PERMISSION_MAP[mod] as FlatModulePermissionMap;
    matrix[mod] = {
      view: hasAnyKey(keySet, map.view),
      create: hasAnyKey(keySet, map.create),
      edit: hasAnyKey(keySet, map.edit),
    };
  }

  // Submodule modules: derive each submodule's flags, then OR parent from submodules
  for (const mod of SUBMODULE_MODULES) {
    const entry = MODULE_PERMISSION_MAP[mod] as SubmodulePermissionMap;
    const submodules: Record<string, ModuleCrudFlags> = {};

    for (const sub of Object.keys(entry.submodules)) {
      const sm = entry.submodules[sub];
      submodules[sub] = {
        view: hasAnyKey(keySet, sm.view),
        create: hasAnyKey(keySet, sm.create),
        edit: hasAnyKey(keySet, sm.edit),
      };
    }

    // Parent flags: view/create/edit derived from OR across submodules + parent-level keys
    const anySubView = Object.values(submodules).some((f) => f.view);
    const anySubCreate = Object.values(submodules).some((f) => f.create);
    const anySubEdit = Object.values(submodules).some((f) => f.edit);

    const parentCreate = hasAnyKey(keySet, entry.create) || anySubCreate;
    const parentEdit = hasAnyKey(keySet, entry.edit) || anySubEdit;
    const parentView = anySubView;

    (matrix[mod] as ModuleWithSubmodules<string>) = {
      view: parentView,
      create: parentCreate,
      edit: parentEdit,
      submodules,
    };
  }

  return matrix;
}

export function normalizeRoleAccessMatrix(partial: Partial<RoleAccessMatrix>): RoleAccessMatrix {
  const base = createEmptyRoleAccessMatrix();

  for (const mod of FLAT_MODULES) {
    const flags = partial[mod];
    if (flags) {
      base[mod] = {
        create: Boolean(flags.create),
        edit: Boolean(flags.edit),
        view: Boolean(flags.view),
      };
    }
  }

  for (const mod of SUBMODULE_MODULES) {
    const incoming = partial[mod] as ModuleWithSubmodules<string> | undefined;
    const baseEntry = base[mod] as ModuleWithSubmodules<string>;

    if (!incoming) continue;

    baseEntry.create = Boolean(incoming.create);
    baseEntry.edit = Boolean(incoming.edit);
    baseEntry.view = Boolean(incoming.view);

    if (incoming.submodules) {
      for (const sub of Object.keys(baseEntry.submodules)) {
        const sf = incoming.submodules[sub];
        if (sf) {
          baseEntry.submodules[sub] = {
            create: Boolean(sf.create),
            edit: Boolean(sf.edit),
            view: Boolean(sf.view),
          };
        }
      }
    }
  }

  return base;
}

// ── Submodule key list exports (used by other modules) ───────────────────────
export {
  APPOINTMENTS_SUBMODULES,
  MASTER_MANAGEMENT_SUBMODULES,
  TRANSACTIONS_SUBMODULES,
  USER_MANAGEMENT_SUBMODULES,
};
