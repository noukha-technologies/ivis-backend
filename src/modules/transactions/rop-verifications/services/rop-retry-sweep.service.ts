import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { AppLogger } from '../../../../common/logger/app.logger';
import { omanDayRange } from '../../../../common/utils/util';
import { isCentreNode } from '../../../../common/config/env.config';
import { RopVerificationDao } from '../../../database/dao/rop-verification.dao';
import { RopVerificationService } from './rop-verification.service';

/** How often failed ROP lookups are re-attempted. */
const SWEEP_INTERVAL_MS = 2 * 60_000;

/**
 * Re-attempts ROP verifications that ended Failed.
 *
 * A failure used to be terminal — the vehicle sat behind the ROP gate until
 * somebody noticed. Most failures are transient (ROP briefly down, a timeout),
 * so a slow sweep clears them on its own while the car is still on site.
 *
 * Bounded to the current Oman day: a plate that failed yesterday belongs to a
 * visit that is over, and retrying it forever would hammer ROP for a car that
 * left long ago. Anything still Failed at the end of the day needs the manual
 * button and an operator's judgement, not more automatic retries.
 *
 * Disable with `ROP_RETRY_SWEEP_DISABLED=true`.
 */
@Injectable()
export class RopRetrySweepService {
  private static readonly context = 'RopRetrySweepService';
  private running = false;

  constructor(
    private readonly ropVerificationDao: RopVerificationDao,
    private readonly ropVerificationService: RopVerificationService,
    private readonly logger: AppLogger,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async tick(): Promise<void> {
    if (process.env.ROP_RETRY_SWEEP_DISABLED === 'true') return;
    // Centre-only workload: central owns no cameras and no ROP traffic.
    if (!isCentreNode()) return;
    // A slow ROP makes a sweep outlast its own interval; skip rather than
    // stack a second pass on top of the first.
    if (this.running) return;

    this.running = true;
    try {
      const failed =
        await this.ropVerificationDao.findFailedWithin(omanDayRange());
      if (failed.length === 0) return;

      this.logger.log(
        `Re-attempting ${failed.length} failed ROP verification(s)`,
        RopRetrySweepService.context,
      );

      for (const verification of failed) {
        try {
          await this.ropVerificationService.refetch(verification.id);
        } catch (err) {
          // One bad plate must not stop the rest of the sweep.
          this.logger.warn(
            `ROP re-fetch failed for verification ${verification.id}: ${(err as Error).message}`,
            RopRetrySweepService.context,
          );
        }
      }
    } catch (err) {
      // Never throw from a scheduled job.
      this.logger.warn(
        `ROP retry sweep failed: ${(err as Error).message}`,
        RopRetrySweepService.context,
      );
    } finally {
      this.running = false;
    }
  }
}
