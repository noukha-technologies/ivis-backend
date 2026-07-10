export interface UserCentreSummary {
  id: string;
  centre_id: number;
  name: string;
  code: string;
}

export interface UserLineSummary {
  id: string;
  line_id: number;
  name: string;
  code: string;
}

import type { AccessScope } from '../constants/access-scope';

export interface UserRoleSummary {
  id: string;
  role_id?: number;
  role_name: string;
  permission_id?: string;
  access_scope?: AccessScope;
  is_center_admin?: boolean;
}

export interface UserResponseInterface {
  id: string;
  user_id: number;
  user_code: string;
  user_name: string;
  email: string;
  role_id: string;
  roleName: string;
  role?: UserRoleSummary;
  center_id?: string | null;
  center?: string;
  centre_name?: string | null;
  assignedCentre?: UserCentreSummary;
  line?: string;
  line_ids?: string[];
  lines?: UserLineSummary[];
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

/**
 * Columns owned by the `core.users` row. Assigned lines are NOT here — a user
 * can have many lines, modelled through `user_line_mappings` (read via the
 * `lineMappings` relation); the centre is a single FK.
 */
export interface IUserFields {
  id: string;
  user_id: number;
  user_code: string;
  user_name: string;
  email: string;
  password: string;
  role_id: string;
  center_id?: string | null;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}
