import { PermissionKeys, ALL_PERMISSION_KEYS } from '../constants/permissions';
import { USER_ROLES } from '../enums/common.enums';

const FULL_ACCESS_ROLES = new Set([USER_ROLES.ADMIN, USER_ROLES.SYSTEM_ADMIN, USER_ROLES.CLIENT_ADMIN]);

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

function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
}

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
