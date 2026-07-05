import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { IConfigurationDao } from '../../configuration/dao/configuration.dao.interface';
import { Configurations } from '../entity/configuration.entity';

@Injectable()
export class ConfigurationDao
  extends Repository<Configurations>
  implements IConfigurationDao
{
  constructor(private readonly dataSource: DataSource) {
    super(Configurations, dataSource.createEntityManager());
  }

  async findByCentreId(centreId: string): Promise<Configurations | null> {
    return this.findOne({
      where: { centre_id: centreId, is_deleted: false },
      relations: { centre: true },
    });
  }

  async getNextConfigurationId(): Promise<number> {
    const result = await this.createQueryBuilder('configuration')
      .select('MAX(configuration.configuration_id)', 'max')
      .getRawOne();
    const max = result?.max ? Number(result.max) : 0;
    return max + 1;
  }
}
