import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { AppLogger } from '../../../common/logger/app.logger';
import { isCentreNode } from '../../../common/config/env.config';
import { ConfigurationDao } from '../../database/dao/configuration.dao';
import { OnboardingStatusDao } from '../../database/dao/onboarding-status.dao';
import { DatabaseSyncService } from './database-sync.service';

/**
 * Oman time, stated explicitly rather than pinned to the server clock — the
 * backend runs on UTC (see main.ts) and a centre's working day is local, so
 * without a zone these would fire four hours out.
 */
const OMAN_TZ = 'Asia/Muscat';

/** Before the centre opens. */
const MORNING_CRON = '30 5 * * *';

/** After it closes. */
const EVENING_CRON = '30 22 * * *';

/**
 * Runs the twice-daily automatic Database Sync.
 *
 * Both slots are PUSH ONLY, and the schedule is fixed in code rather than
 * configurable. Two decisions worth stating, because both were deliberate:
 *
 * WHY THE TIMES ARE NOT EDITABLE — a run walks every synced table and competes
 * with the inspection lanes for the same database. The only reason to move it
 * is to move it out of the working day, which is where it already is. Leaving
 * the times on the Configuration screen offered no useful choice and one
 * harmful one.
 *
 * WHY IT NEVER PULLS — pulling masters overwrites this centre's configuration
 * from central. For READ_ONLY entities that overwrite is unconditional (see
 * SYNC_ENTITY_MAP bucket A), so a pull silently reverts anything a centre
 * changed locally. Unattended at 05:30 that is invisible: the operator arrives
 * to a setting they changed yesterday, back as it was, with nothing on screen
 * to say why. Pulling masters is an administrative act with a blast radius, so
 * it stays behind the deliberate "Sync Masters" button on the Sync Log page.
 *
 * Only ever active on a centre node whose onboarding is COMPLETED and whose
 * configuration has sync_mode = 'Automatic'.
 */
@Injectable()
export class SyncSchedulerService {
  private static readonly context = 'SyncSchedulerService';

  /**
   * Guards against a slow run overlapping the next slot. The two slots are
   * ~17 hours apart so this should never engage, but a run that hangs on a
   * dead network must not stack a second one on top of it.
   */
  private running = false;

  constructor(
    private readonly databaseSync: DatabaseSyncService,
    private readonly configurationDao: ConfigurationDao,
    private readonly onboardingStatusDao: OnboardingStatusDao,
    private readonly logger: AppLogger,
  ) {}

  @Cron(MORNING_CRON, { timeZone: OMAN_TZ })
  async morningPush(): Promise<void> {
    await this.runScheduledPush('morning');
  }

  @Cron(EVENING_CRON, { timeZone: OMAN_TZ })
  async eveningPush(): Promise<void> {
    await this.runScheduledPush('evening');
  }

  private async runScheduledPush(slot: 'morning' | 'evening'): Promise<void> {
    // Central serves the sync endpoints but never initiates a run — it has no
    // centre of its own to push.
    if (!isCentreNode()) return;

    if (this.running) {
      this.logger.warn(
        `Skipping the ${slot} sync — the previous run has not finished.`,
        SyncSchedulerService.context,
      );
      return;
    }

    try {
      const onboarding = await this.onboardingStatusDao.getStatus();
      if (onboarding?.status !== 'COMPLETED' || !onboarding.centre_id) {
        this.logger.log(
          `Skipping the ${slot} sync — this centre has not completed onboarding.`,
          SyncSchedulerService.context,
        );
        return;
      }

      const config = await this.configurationDao.findByCentreId(
        onboarding.centre_id,
      );
      if (config?.sync_mode !== 'Automatic') {
        // Manual is the default and the common case; log at debug so a centre
        // that has deliberately opted out does not warn twice a day forever.
        this.logger.debug(
          `Skipping the ${slot} sync — sync mode is ${config?.sync_mode ?? 'unset'}, not Automatic.`,
          SyncSchedulerService.context,
        );
        return;
      }

      this.running = true;
      this.logger.log(
        `Starting the ${slot} automatic sync (push only).`,
        SyncSchedulerService.context,
      );

      const result = await this.databaseSync.runSync('push');

      const pushed = Object.values(result.pushed).reduce((a, b) => a + b, 0);
      this.logger.log(
        `${slot} automatic sync finished: ${result.status}, ${pushed} row(s) pushed.` +
          (result.error ? ` ${result.error}` : ''),
        SyncSchedulerService.context,
      );
    } catch (err) {
      // Never rethrow: an unhandled rejection out of a cron handler takes the
      // process down, and a failed sync must not stop a centre inspecting cars.
      // The run is recorded in the sync log either way.
      this.logger.error(
        `${slot} automatic sync failed: ${(err as Error).message}`,
        (err as Error).stack,
        SyncSchedulerService.context,
      );
    } finally {
      this.running = false;
    }
  }
}
