import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { IOnboardingStatusDao } from '../../onboarding/dao/onboarding-status.dao.interface';
import { OnboardingStatus } from '../entity/onboarding-status.entity';
import { OnboardingStatusValue } from '../../../common/enums/onboarding.enums';
import { generateSnowflakeId } from '../../../common/shared/snowflakeIdGeneration';

@Injectable()
export class OnboardingStatusDao
  extends Repository<OnboardingStatus>
  implements IOnboardingStatusDao
{
  constructor(private readonly dataSource: DataSource) {
    super(OnboardingStatus, dataSource.createEntityManager());
  }

  async ensureSingletonRow(): Promise<OnboardingStatus> {
    const existing = await this.getStatus();
    if (existing) {
      return existing;
    }
    return this.save(
      this.create({ id: generateSnowflakeId(), status: 'PENDING' }),
    );
  }

  async getStatus(): Promise<OnboardingStatus | null> {
    return this.createQueryBuilder('onboarding_status')
      .orderBy('onboarding_status.created_at', 'ASC')
      .getOne();
  }

  async tryClaim(
    id: string,
    fromStatuses: OnboardingStatusValue[],
    toStatus: OnboardingStatusValue,
    extra: Partial<OnboardingStatus> = {},
  ): Promise<boolean> {
    const result = await this.createQueryBuilder()
      .update(OnboardingStatus)
      .set({ status: toStatus, updated_at: new Date(), ...extra })
      .where('id = :id', { id })
      .andWhere('status IN (:...fromStatuses)', { fromStatuses })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.createQueryBuilder()
      .update(OnboardingStatus)
      .set({ status: 'FAILED', last_error: error })
      .where('id = :id', { id })
      .execute();
  }
}
