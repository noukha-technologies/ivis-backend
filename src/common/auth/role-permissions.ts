import { PermissionKeys } from '../constants/permissions.js';

const ALL_PERMISSIONS = Object.values(PermissionKeys);

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  admin: ALL_PERMISSIONS,
  system_admin: ALL_PERMISSIONS,
  client_admin: ALL_PERMISSIONS,
};

export function resolvePermissionsForRole(role: string): string[] {
  const normalized = role.trim().toLowerCase();
  return ROLE_PERMISSION_MAP[normalized] ?? [PermissionKeys.USER_VIEW];
}
