export const ROLE_ACCESS_MODULES = [
  'dashboard',
  'appointments',
  'job_management',
  'reports_analytics',
  'configuration',
  'master_management',
  'transactions',
  'user_management',
] as const;

export type RoleAccessModule = (typeof ROLE_ACCESS_MODULES)[number];

export type ModuleCrudFlags = {
  create: boolean;
  edit: boolean;
  view: boolean;
};

export type ModuleWithSubmodules<S extends string> = ModuleCrudFlags & {
  submodules: Record<S, ModuleCrudFlags>;
};

export type AppointmentsSubmodule = 'list_view' | 'calendar_view';
export type MasterManagementSubmodule =
  | 'vehicle'
  | 'center'
  | 'line'
  | 'admin_pc'
  | 'camera_anpr'
  | 'charges';
export type TransactionsSubmodule =
  | 'payments'
  | 'vehicle_records'
  | 'customers'
  | 'file_processing'
  | 'rop_management';
export type UserManagementSubmodule =
  | 'users'
  | 'roles'
  | 'permissions'
  | 'audit_logs';

export type RoleAccessMatrix = {
  dashboard: ModuleCrudFlags;
  appointments: ModuleWithSubmodules<AppointmentsSubmodule>;
  job_management: ModuleCrudFlags;
  reports_analytics: ModuleCrudFlags;
  configuration: ModuleCrudFlags;
  master_management: ModuleWithSubmodules<MasterManagementSubmodule>;
  transactions: ModuleWithSubmodules<TransactionsSubmodule>;
  user_management: ModuleWithSubmodules<UserManagementSubmodule>;
};

export const APPOINTMENTS_SUBMODULES: AppointmentsSubmodule[] = [
  'list_view',
  'calendar_view',
];
export const MASTER_MANAGEMENT_SUBMODULES: MasterManagementSubmodule[] = [
  'vehicle',
  'center',
  'line',
  'admin_pc',
  'camera_anpr',
  'charges',
];
export const TRANSACTIONS_SUBMODULES: TransactionsSubmodule[] = [
  'payments',
  'vehicle_records',
  'customers',
  'file_processing',
  'rop_management',
];
export const USER_MANAGEMENT_SUBMODULES: UserManagementSubmodule[] = [
  'users',
  'roles',
  'permissions',
  'audit_logs',
];

export const FLAT_MODULES = [
  'dashboard',
  'job_management',
  'reports_analytics',
  'configuration',
] as const;
export const SUBMODULE_MODULES = [
  'appointments',
  'master_management',
  'transactions',
  'user_management',
] as const;

export function createEmptyRoleAccessMatrix(): RoleAccessMatrix {
  const empty = (): ModuleCrudFlags => ({
    create: false,
    edit: false,
    view: false,
  });
  const emptySubmap = <T extends string>(
    keys: T[],
  ): Record<T, ModuleCrudFlags> =>
    Object.fromEntries(keys.map((k) => [k, empty()])) as Record<
      T,
      ModuleCrudFlags
    >;

  return {
    dashboard: empty(),
    job_management: empty(),
    reports_analytics: empty(),
    configuration: empty(),
    appointments: {
      ...empty(),
      submodules: emptySubmap(APPOINTMENTS_SUBMODULES),
    },
    master_management: {
      ...empty(),
      submodules: emptySubmap(MASTER_MANAGEMENT_SUBMODULES),
    },
    transactions: {
      ...empty(),
      submodules: emptySubmap(TRANSACTIONS_SUBMODULES),
    },
    user_management: {
      ...empty(),
      submodules: emptySubmap(USER_MANAGEMENT_SUBMODULES),
    },
  };
}
