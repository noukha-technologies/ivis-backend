import { User } from '../../modules/database/entity/user.entity';
import { UserResponseInterface } from '../interfaces/user.interface';

export type UserResponse = UserResponseInterface;

export function mapUserToResponse(user: User): UserResponse {
  const activeMappings = (user.lineMappings ?? []).filter((m) => !m.is_deleted);
  const line_ids = activeMappings.map((m) => m.line_id);
  const lines = activeMappings
    .map((m) => m.line)
    .filter((line): line is NonNullable<typeof line> => Boolean(line))
    .map((line) => ({
      id: line.id,
      line_id: line.line_id,
      name: line.name,
      code: line.code,
    }));

  const centre = user.assignedCentre;

  return {
    id: user.id,
    user_id: user.user_id,
    user_code: user.user_code,
    user_name: user.user_name,
    email: user.email,
    role_id: user.role_id,
    roleName: user.role?.role_name ?? '',
    role: user.role
      ? {
          id: user.role.id,
          role_id: user.role.role_id,
          role_name: user.role.role_name,
          permission_id: user.role.permission_id,
        }
      : undefined,
    center_id: user.center_id ?? null,
    center: centre?.name,
    centre_name: centre?.name ?? null,
    line: lines[0]?.name,
    assignedCentre: centre
      ? {
          id: centre.id,
          centre_id: centre.centre_id,
          name: centre.name,
          code: centre.code,
        }
      : undefined,
    line_ids: line_ids.length > 0 ? line_ids : undefined,
    lines: lines.length > 0 ? lines : undefined,
    created_at:
      user.created_at instanceof Date
        ? user.created_at.toISOString()
        : new Date(user.created_at).toISOString(),
    updated_at:
      user.updated_at instanceof Date
        ? user.updated_at.toISOString()
        : new Date(user.updated_at).toISOString(),
    deleted_at: undefined,
  };
}
