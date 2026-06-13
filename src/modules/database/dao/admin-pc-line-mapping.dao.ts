import { Injectable } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { IAdminPcLineMappingDao } from '../../masters/admin-pcs/dao/admin-pc-line-mapping.dao.interface';
import { AdminPcLineMapping } from '../entity/admin-pc-line-mapping.entity';

@Injectable()
export class AdminPcLineMappingDao
  extends Repository<AdminPcLineMapping>
  implements IAdminPcLineMappingDao
{
  constructor(private readonly dataSource: DataSource) {
    super(AdminPcLineMapping, dataSource.createEntityManager());
  }

  async findActiveByAdminPcId(adminPcId: string): Promise<AdminPcLineMapping[]> {
    return this.find({
      where: { admin_pc_id: adminPcId, is_deleted: false },
      relations: { line: { centre: true } },
      order: { created_at: 'ASC' },
    });
  }

  async findActiveByLineIds(lineIds: string[]): Promise<AdminPcLineMapping[]> {
    if (!lineIds.length) {
      return [];
    }
    return this.find({
      where: { line_id: In(lineIds), is_deleted: false },
    });
  }

  async replaceForAdminPc(adminPcId: string, lineIds: string[], createdBy?: string): Promise<void> {
    const uniqueLineIds = [...new Set(lineIds.map((id) => id.trim()).filter(Boolean))];

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        AdminPcLineMapping,
        { admin_pc_id: adminPcId, is_deleted: false },
        { is_deleted: true },
      );

      if (uniqueLineIds.length === 0) {
        return;
      }

      const rows = uniqueLineIds.map((lineId) =>
        manager.create(AdminPcLineMapping, {
          id: generateSnowflakeId(),
          admin_pc_id: adminPcId,
          line_id: lineId,
          created_by: createdBy,
          is_deleted: false,
        }),
      );

      await manager.save(AdminPcLineMapping, rows);
    });
  }

  async softDeleteByAdminPcId(adminPcId: string): Promise<void> {
    await this.update({ admin_pc_id: adminPcId, is_deleted: false }, { is_deleted: true });
  }
}
