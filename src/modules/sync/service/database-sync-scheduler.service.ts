import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppLogger } from '../../../common/logger/app.logger';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';
import { ConfigurationDao } from '../../database/dao/configuration.dao';
import { DatabaseSyncService } from './database-sync.service';

/**
 * Automatic-mode Database Sync — NOT a polling interval. Fires at exactly
 * two clock times a day (Oman time), configured per centre via
 * Configurations.sync_time_morning / sync_time_evening (same 'HH:mm'
 * pattern as the existing auto_close_time field). See
 * DATABASE_SYNC_PLAN.md §6.5.
 */
@Injectable()
export class DatabaseSyncSchedulerService {
  private static readonly context = 'DatabaseSyncSchedulerService';
  /** Guards against firing twice in the same minute (a slow prior run, or a re-entrant tick). */
  private lastFiredKey: string | null = null;

  constructor(
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly configurationDao: ConfigurationDao,
    private readonly databaseSyncService: DatabaseSyncService,
    private readonly logger: AppLogger,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Muscat' })
  async tick(): Promise<void> {
    try {
      const onboarding = await this.onboardingStatusDao.getStatus();
      if (!onboarding || onboarding.status !== 'COMPLETED' || !onboarding.centre_id) {
        return; // nothing to sync until this centre is onboarded
      }

      const config = await this.configurationDao.findByCentreId(onboarding.centre_id);
      if (!config || config.sync_mode !== 'Automatic') {
        return;
      }

      const nowHHmm = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Muscat',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());

      const isScheduledNow =
        nowHHmm === config.sync_time_morning || nowHHmm === config.sync_time_evening;
      if (!isScheduledNow) {
        return;
      }

      const fireKey = `${new Date().toDateString()}-${nowHHmm}`;
      if (fireKey === this.lastFiredKey) {
        return; // already ran for this exact minute
      }
      this.lastFiredKey = fireKey;

      this.logger.log(
        `Automatic Database Sync firing (${nowHHmm} Oman time)`,
        DatabaseSyncSchedulerService.context,
      );
      const result = await this.databaseSyncService.runSync();
      this.logger.log(
        `Automatic Database Sync complete: ${result.status}`,
        DatabaseSyncSchedulerService.context,
      );
    } catch (error) {
      this.logger.error(
        `Automatic Database Sync tick failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
        DatabaseSyncSchedulerService.context,
      );
    }
  }
}
