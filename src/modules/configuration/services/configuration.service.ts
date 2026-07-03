import { Injectable } from '@nestjs/common';

import type { UserContext } from '../../../common/dto/auth.dto';
import { CreateConfigurationDto, UpdateConfigurationDto } from '../../../common/dto/configuration.dto';

import { AppLogger } from '../../../common/logger/app.logger';
import { getCreatedById } from '../../../common/utils/created-by.util';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';
import { MasterScopeService } from '../../../common/services/master-scope.service';
import { DatabaseException, ResourceNotFoundException } from '../../../common/exceptions/custom.exception';

import { ConfigurationDao } from '../../database/dao/configuration.dao';
import { Configurations } from '../../database/entity/configuration.entity';

@Injectable()
export class ConfigurationService {
  private static readonly context = 'ConfigurationService';

  constructor(
    private readonly logger: AppLogger,
    private readonly configurationDao: ConfigurationDao,
    private readonly masterScope: MasterScopeService,
  ) {}

  async getByCentre(centreId: string): Promise<Configurations> {
    const centreFkId = await this.masterScope.resolveCentreId(centreId);
    const config = await this.configurationDao.findByCentreId(centreFkId);
    if (!config) {
      throw new ResourceNotFoundException('Configuration', centreId);
    }
    return config;
  }

  /**
   * Upsert the (single) configuration row for a centre. Creates it on first
   * save; merges thereafter — enforced by the unique centre_id.
   */
  async upsert(dto: CreateConfigurationDto, actor: UserContext): Promise<Configurations> {
    this.logger.log(`Upserting configuration for centre: ${dto.centre_id}`, ConfigurationService.context);

    try {
      const centreFkId = await this.masterScope.resolveCentreId(dto.centre_id);
      const existing = await this.configurationDao.findByCentreId(centreFkId);
      const createdBy = getCreatedById(actor);

      const { centre_id: _centreId, configuration_id: _configId, ...settings } = dto;

      if (existing) {
        const merged = this.configurationDao.merge(existing, settings);
        const saved = await this.configurationDao.save(merged);
        return (await this.configurationDao.findByCentreId(centreFkId)) ?? saved;
      }

      const created = this.configurationDao.create({
        id: generateSnowflakeId(),
        configuration_id: await this.configurationDao.getNextConfigurationId(),
        centre_id: centreFkId,
        ...settings,
        created_by: createdBy,
      });
      const saved = await this.configurationDao.save(created);
      return (await this.configurationDao.findByCentreId(centreFkId)) ?? saved;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to upsert configuration: ${(error as Error).message}`,
        (error as Error).stack,
        ConfigurationService.context,
      );
      throw new DatabaseException('Failed to save configuration. Please try again.');
    }
  }

  async updateByCentre(
    centreId: string,
    dto: UpdateConfigurationDto,
    actor: UserContext,
  ): Promise<Configurations> {
    return this.upsert({ centre_id: centreId, ...dto }, actor);
  }
}
