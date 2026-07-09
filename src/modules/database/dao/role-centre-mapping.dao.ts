import { Injectable } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { IRoleCentreMappingDao } from '../../roles/dao/role-centre-mapping.dao.interface';
import { RoleCentreMapping } from '../entity/role-centre-mapping.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class RoleCentreMappingDao
  extends Repository<RoleCentreMapping>
  implements IRoleCentreMappingDao
{
  constructor(private readonly dataSource: DataSource) {
    super(RoleCentreMapping, dataSource.createEntityManager());
  }

  async findActiveByRoleId(roleId: string): Promise<RoleCentreMapping[]> {
    return this.find({
      where: { role_id: roleId, is_deleted: false },
      relations: { centre: true },
      order: { created_at: 'ASC' },
    });
  }

  async findActiveByRoleIds(roleIds: string[]): Promise<RoleCentreMapping[]> {
    if (!roleIds.length) {
      return [];
    }
    return this.find({
      where: { role_id: In(roleIds), is_deleted: false },
      relations: { centre: true },
    });
  }

  async findActiveByCentreId(centreId: string): Promise<RoleCentreMapping[]> {
    return this.find({
      where: { centre_id: centreId, is_deleted: false },
    });
  }

  /**
   * Diff-based update: compares the role's current active centres against the
   * desired set — inserts the added ones, soft-deletes the removed ones, and
   * leaves unchanged mappings intact (preserving their created_at / created_by).
   * Mirrors UserLineMappingDao.syncForUser.
   */
  async syncForRole(
    roleId: string,
    centreIds: string[],
    createdBy?: string,
  ): Promise<void> {
    const desired = [
      ...new Set(centreIds.map((id) => id.trim()).filter(Boolean)),
    ];

    const existing = await this.find({
      where: { role_id: roleId, is_deleted: false },
    });
    const existingByCentre = new Set(existing.map((m) => m.centre_id));
    const desiredSet = new Set(desired);

    const toAdd = desired.filter((id) => !existingByCentre.has(id));
    const toRemove = existing.filter((m) => !desiredSet.has(m.centre_id));

    if (toAdd.length === 0 && toRemove.length === 0) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      if (toRemove.length > 0) {
        await manager.update(
          RoleCentreMapping,
          { id: In(toRemove.map((m) => m.id)) },
          { is_deleted: true },
        );
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((centreId) =>
          manager.create(RoleCentreMapping, {
            id: generateSnowflakeId(),
            role_id: roleId,
            centre_id: centreId,
            created_by: createdBy,
            is_deleted: false,
          }),
        );
        await manager.save(RoleCentreMapping, rows);
      }
    });
  }

  async softDeleteByRoleId(roleId: string): Promise<void> {
    await this.update(
      { role_id: roleId, is_deleted: false },
      { is_deleted: true },
    );
  }
}
