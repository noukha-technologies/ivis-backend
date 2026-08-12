import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';

import { ICentreApiKeyDao } from '../../sync/dao/centre-api-key.dao.interface';
import { CentreApiKey } from '../entity/centre-api-key.entity';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class CentreApiKeyDao
  extends Repository<CentreApiKey>
  implements ICentreApiKeyDao
{
  constructor(private readonly dataSource: DataSource) {
    super(CentreApiKey, dataSource.createEntityManager());
  }

  async createForCentre(
    centreId: string,
    keyHash: string,
  ): Promise<CentreApiKey> {
    return this.save(
      this.create({
        id: generateSnowflakeId(),
        centre_id: centreId,
        key_hash: keyHash,
      }),
    );
  }

  async findAllActive(): Promise<CentreApiKey[]> {
    return this.find({ where: { revoked_at: IsNull() } });
  }

  async revoke(id: string): Promise<void> {
    await this.createQueryBuilder()
      .update(CentreApiKey)
      .set({ revoked_at: new Date() })
      .where('id = :id', { id })
      .execute();
  }
}
