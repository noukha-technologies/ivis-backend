import { Injectable } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { IUserLineMappingDao } from '../../users/dao/user-line-mapping.dao.interface';
import { UserLineMapping } from '../entity/user-line-mapping.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class UserLineMappingDao extends Repository<UserLineMapping> implements IUserLineMappingDao {
  constructor(private readonly dataSource: DataSource) {
    super(UserLineMapping, dataSource.createEntityManager());
  }

  async findActiveByUserId(userId: string): Promise<UserLineMapping[]> {
    return this.find({
      where: { user_id: userId, is_deleted: false },
      relations: { line: true },
      order: { created_at: 'ASC' },
    });
  }

  async replaceForUser(userId: string, lineIds: string[], createdBy?: string): Promise<void> {
    const uniqueLineIds = [...new Set(lineIds.map((id) => id.trim()).filter(Boolean))];

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        UserLineMapping,
        { user_id: userId, is_deleted: false },
        { is_deleted: true },
      );

      if (uniqueLineIds.length === 0) {
        return;
      }

      const rows = uniqueLineIds.map((lineId) =>
        manager.create(UserLineMapping, {
          id: generateSnowflakeId(),
          user_id: userId,
          line_id: lineId,
          created_by: createdBy,
          is_deleted: false,
        }),
      );

      await manager.save(UserLineMapping, rows);
    });
  }

  async softDeleteByUserId(userId: string): Promise<void> {
    await this.update({ user_id: userId, is_deleted: false }, { is_deleted: true });
  }

  async findActiveByLineIds(lineIds: string[]): Promise<UserLineMapping[]> {
    if (!lineIds.length) {
      return [];
    }
    return this.find({
      where: { line_id: In(lineIds), is_deleted: false },
    });
  }
}
