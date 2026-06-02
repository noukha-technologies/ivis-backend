import { User } from '../../modules/database/entity/user.entity';

export interface UserLineSummary {
  id: string;
  line_id: number;
  name: string;
  code: string;
}

export type UserResponse = Omit<User, 'password' | 'lineMappings' | 'hashPassword'> & {
  line_ids: string[];
  lines: UserLineSummary[];
};

export function mapUserToResponse(user: User): UserResponse {
  const activeMappings = (user.lineMappings ?? []).filter((m) => !m.is_deleted);
  const line_ids = activeMappings.map((m) => m.line_id);
  const lines: UserLineSummary[] = activeMappings
    .filter((m) => m.line)
    .map((m) => ({
      id: m.line.id,
      line_id: m.line.line_id,
      name: m.line.name,
      code: m.line.code,
    }));

  const { password: _password, lineMappings: _lineMappings, ...rest } = user;
  return {
    ...rest,
    line_ids,
    lines,
  };
}
