import { RoleCentreMapping } from '../../database/entity/role-centre-mapping.entity';

export interface IRoleCentreMappingDao {
  findActiveByRoleId(roleId: string): Promise<RoleCentreMapping[]>;
  findActiveByRoleIds(roleIds: string[]): Promise<RoleCentreMapping[]>;
  findActiveByCentreId(centreId: string): Promise<RoleCentreMapping[]>;
  /** Diff the role's active centres against the desired set: insert added, soft-delete removed, keep unchanged. */
  syncForRole(
    roleId: string,
    centreIds: string[],
    createdBy?: string,
  ): Promise<void>;
  softDeleteByRoleId(roleId: string): Promise<void>;
}
