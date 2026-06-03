import { User } from '../../modules/database/entity/user.entity';
import { UserResponseInterface } from '../interfaces/user.interface';

export type UserResponse = UserResponseInterface;

export function mapUserToResponse(user: User): UserResponse {
  const activeMappings = (user.lineMappings ?? []).filter((m) => !m.is_deleted);
  const line_ids = activeMappings.map((m) => m.line_id);

  return {
    id: user.id,
    user_code: user.user_code,
    user_name: user.user_name,
    email: user.email,
    role_id: user.role_id,
    roleName: user.role?.role_name ?? '',
    center_id: user.center_id ?? undefined,
    line_ids: line_ids.length > 0 ? line_ids : undefined,
    created_at: user.created_at instanceof Date ? user.created_at.toISOString() : new Date(user.created_at).toISOString(),
    updated_at: user.updated_at instanceof Date ? user.updated_at.toISOString() : new Date(user.updated_at).toISOString(),
    deleted_at: undefined,
  };
}
