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

export interface UserRoleSummary {
  id: string;
  role_id?: number;
  role_name: string;
  permission_id?: string;
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