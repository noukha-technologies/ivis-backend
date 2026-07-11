/**
 * IVIS permission keys — single source of truth for guards, role maps, and DB seed.
 */
export const PermissionKeys = {
  // Users
  USER_VIEW: 'USER_VIEW',
  USER_CREATE: 'USER_CREATE',
  USER_EDIT: 'USER_EDIT',
  USER_DELETE: 'USER_DELETE',
  USER_IMPERSONATE: 'USER_IMPERSONATE',

  // Roles
  ROLES_CREATE: 'ROLES_CREATE',
  ROLES_VIEW: 'ROLES_VIEW',
  ROLES_UPSERT: 'ROLES_UPSERT',
  ROLES_DELETE: 'ROLES_DELETE',

  // Permissions
  PERMISSIONS_CREATE: 'PERMISSIONS_CREATE',
  PERMISSIONS_VIEW: 'PERMISSIONS_VIEW',
  PERMISSIONS_UPSERT: 'PERMISSIONS_UPSERT',
  PERMISSIONS_DELETE: 'PERMISSIONS_DELETE',

  // Masters
  MASTERS_CREATE: 'MASTERS_CREATE',
  MASTERS_VIEW: 'MASTERS_VIEW',
  MASTERS_UPSERT: 'MASTERS_UPSERT',
  MASTERS_DELETE: 'MASTERS_DELETE',

  // ANPR
  ANPR_CREATE: 'ANPR_CREATE',
  ANPR_VIEW: 'ANPR_VIEW',
  ANPR_UPSERT: 'ANPR_UPSERT',
  ANPR_DELETE: 'ANPR_DELETE',

  // ROP
  ROP_CREATE: 'ROP_CREATE',
  ROP_VIEW: 'ROP_VIEW',
  ROP_UPSERT: 'ROP_UPSERT',
  ROP_DELETE: 'ROP_DELETE',

  // Vehicle records
  VEHICLE_RECORDS_CREATE: 'VEHICLE_RECORDS_CREATE',
  VEHICLE_RECORDS_VIEW: 'VEHICLE_RECORDS_VIEW',
  VEHICLE_RECORDS_UPSERT: 'VEHICLE_RECORDS_UPSERT',
  VEHICLE_RECORDS_DELETE: 'VEHICLE_RECORDS_DELETE',

  // Customers
  CUSTOMERS_CREATE: 'CUSTOMERS_CREATE',
  CUSTOMERS_VIEW: 'CUSTOMERS_VIEW',
  CUSTOMERS_UPSERT: 'CUSTOMERS_UPSERT',
  CUSTOMERS_DELETE: 'CUSTOMERS_DELETE',

  // Payments
  PAYMENTS_CREATE: 'PAYMENTS_CREATE',
  PAYMENTS_VIEW: 'PAYMENTS_VIEW',
  PAYMENTS_UPSERT: 'PAYMENTS_UPSERT',
  PAYMENTS_DELETE: 'PAYMENTS_DELETE',

  // Appointments
  APPOINTMENTS_CREATE: 'APPOINTMENTS_CREATE',
  APPOINTMENTS_VIEW: 'APPOINTMENTS_VIEW',
  APPOINTMENTS_UPSERT: 'APPOINTMENTS_UPSERT',
  APPOINTMENTS_DELETE: 'APPOINTMENTS_DELETE',

  // Jobs
  JOBS_CREATE: 'JOBS_CREATE',
  JOBS_VIEW: 'JOBS_VIEW',
  JOBS_UPSERT: 'JOBS_UPSERT',
  JOBS_DELETE: 'JOBS_DELETE',

  // Operations
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',
  REPORTS_VIEW: 'REPORTS_VIEW',
  CONFIGURATION_VIEW: 'CONFIGURATION_VIEW',
  CONFIGURATION_UPSERT: 'CONFIGURATION_UPSERT',
  FILE_PROCESSING_VIEW: 'FILE_PROCESSING_VIEW',
} as const;

export type PermissionKey =
  (typeof PermissionKeys)[keyof typeof PermissionKeys];

export const ALL_PERMISSION_KEYS: PermissionKey[] =
  Object.values(PermissionKeys);

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PermissionKeys.USER_VIEW]: 'View users',
  [PermissionKeys.USER_CREATE]: 'Create users',
  [PermissionKeys.USER_EDIT]: 'Edit users',
  [PermissionKeys.USER_DELETE]: 'Delete users',
  [PermissionKeys.USER_IMPERSONATE]: 'Log in as a Centre Admin',

  [PermissionKeys.ROLES_CREATE]: 'Create roles',
  [PermissionKeys.ROLES_VIEW]: 'View roles',
  [PermissionKeys.ROLES_UPSERT]: 'Create and update roles',
  [PermissionKeys.ROLES_DELETE]: 'Delete roles',

  [PermissionKeys.PERMISSIONS_CREATE]: 'Create permissions',
  [PermissionKeys.PERMISSIONS_VIEW]: 'View permissions',
  [PermissionKeys.PERMISSIONS_UPSERT]: 'Create and update permissions',
  [PermissionKeys.PERMISSIONS_DELETE]: 'Delete permissions',

  [PermissionKeys.MASTERS_CREATE]: 'Create master data',
  [PermissionKeys.MASTERS_VIEW]: 'View master data',
  [PermissionKeys.MASTERS_UPSERT]: 'Create and update master data',
  [PermissionKeys.MASTERS_DELETE]: 'Delete master data',

  [PermissionKeys.ANPR_CREATE]: 'Create ANPR captures',
  [PermissionKeys.ANPR_VIEW]: 'View ANPR captures',
  [PermissionKeys.ANPR_UPSERT]: 'Create and update ANPR captures',
  [PermissionKeys.ANPR_DELETE]: 'Delete ANPR captures',

  [PermissionKeys.ROP_CREATE]: 'Create ROP verifications',
  [PermissionKeys.ROP_VIEW]: 'View ROP verifications',
  [PermissionKeys.ROP_UPSERT]: 'Create and update ROP verifications',
  [PermissionKeys.ROP_DELETE]: 'Delete ROP verifications',

  [PermissionKeys.VEHICLE_RECORDS_CREATE]: 'Create vehicle records',
  [PermissionKeys.VEHICLE_RECORDS_VIEW]: 'View vehicle records',
  [PermissionKeys.VEHICLE_RECORDS_UPSERT]: 'Create and update vehicle records',
  [PermissionKeys.VEHICLE_RECORDS_DELETE]: 'Delete vehicle records',

  [PermissionKeys.CUSTOMERS_CREATE]: 'Create customers',
  [PermissionKeys.CUSTOMERS_VIEW]: 'View customers',
  [PermissionKeys.CUSTOMERS_UPSERT]: 'Create and update customers',
  [PermissionKeys.CUSTOMERS_DELETE]: 'Delete customers',

  [PermissionKeys.PAYMENTS_CREATE]: 'Create payment transactions',
  [PermissionKeys.PAYMENTS_VIEW]: 'View payment transactions',
  [PermissionKeys.PAYMENTS_UPSERT]: 'Create and update payment transactions',
  [PermissionKeys.PAYMENTS_DELETE]: 'Delete payment transactions',

  [PermissionKeys.APPOINTMENTS_CREATE]: 'Create appointments',
  [PermissionKeys.APPOINTMENTS_VIEW]: 'View appointments',
  [PermissionKeys.APPOINTMENTS_UPSERT]: 'Create and update appointments',
  [PermissionKeys.APPOINTMENTS_DELETE]: 'Delete appointments',

  [PermissionKeys.JOBS_CREATE]: 'Create inspection jobs',
  [PermissionKeys.JOBS_VIEW]: 'View inspection jobs',
  [PermissionKeys.JOBS_UPSERT]: 'Create and update inspection jobs',
  [PermissionKeys.JOBS_DELETE]: 'Delete inspection jobs',

  [PermissionKeys.DASHBOARD_VIEW]: 'View dashboard',
  [PermissionKeys.REPORTS_VIEW]: 'View reports and analytics',
  [PermissionKeys.CONFIGURATION_VIEW]: 'View and manage configuration',
  [PermissionKeys.CONFIGURATION_UPSERT]:
    'Create or update centre configuration',
  [PermissionKeys.FILE_PROCESSING_VIEW]: 'View and manage file processing',
};

/** DB seed rows derived from PermissionKeys + PERMISSION_DESCRIPTIONS */
export const PERMISSION_SEED_ROWS: Array<{
  key: PermissionKey;
  description: string;
}> = ALL_PERMISSION_KEYS.map((key) => ({
  key,
  description: PERMISSION_DESCRIPTIONS[key],
}));
