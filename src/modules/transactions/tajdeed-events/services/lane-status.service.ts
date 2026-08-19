import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppLogger } from '../../../../common/logger/app.logger';
import { TajdeedEventType } from '../../../../common/enums/common.enums';
import { CentreDao } from '../../../database/dao/centre.dao';
import { LineDao } from '../../../database/dao/line.dao';
import { JobDao } from '../../../database/dao/job.dao';
import { Centre } from '../../../database/entity/centre.entity';
import { Job } from '../../../database/entity/job.entity';
import {
  LaneStatusEntry,
  LaneOccupancyStatus,
} from '../../../../common/integrations/appointments/appointment.types';
import { TajdeedOutboxService } from './tajdeed-outbox.service';
import { normalizePlate } from '../../../../common/integrations/appointments/inspection-result.mapper';
import { isCentreNode } from '../../../../common/config/env.config';

/**
 * The provider asks for a full snapshot every 5 minutes. Because a heartbeat
 * OVERWRITES the state they hold, it doubles as the repair mechanism for any
 * single change that was lost — which is why this is the primary mechanism
 * here rather than an optimisation on top of per-transition pushes.
 */
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;

/**
 * Reports lane occupancy to the appointment provider.
 *
 * IVIS stores no lane state — there is no "occupied" column anywhere. What a
 * lane is doing is derived at read time from the jobs on its line, exactly as
 * the lane-assignment screen already derives it. That derivation is the whole
 * of this service.
 *
 * Only the heartbeat is implemented. Per-transition pushes were considered and
 * left out: they would need a hook on every job state change, and the 5-minute
 * snapshot already converges to the same state without one. The cost is up to
 * 5 minutes of staleness on their side, which lane display can absorb.
 *
 * Disable with `TAJDEED_PUSH_DISABLED=true` (shared with the dispatcher) or
 * `TAJDEED_LANE_STATUS_DISABLED=true`.
 */
@Injectable()
export class LaneStatusService {
  private static readonly context = 'LaneStatusService';

  constructor(
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly jobDao: JobDao,
    private readonly outbox: TajdeedOutboxService,
    private readonly logger: AppLogger,
  ) {}

  @Interval(HEARTBEAT_INTERVAL_MS)
  async heartbeat(): Promise<void> {
    // Centre-only workload — see isCentreNode(). Central serves the same
    // controllers but owns no cameras, no FTP shares and no provider branch.
    if (!isCentreNode()) return;

    if (
      process.env.TAJDEED_PUSH_DISABLED === 'true' ||
      process.env.TAJDEED_LANE_STATUS_DISABLED === 'true'
    ) {
      return;
    }

    try {
      const centres = await this.centreDao.findAllWithProviderBranchCode();
      for (const centre of centres) {
        await this.pushCentre(centre);
      }
    } catch (err) {
      this.logger.warn(
        `Lane status heartbeat failed: ${(err as Error).message}`,
        LaneStatusService.context,
      );
    }
  }

  private async pushCentre(centre: Centre): Promise<void> {
    const branchCode = centre.provider_branch_code?.trim();
    if (!branchCode) return;

    const lines = await this.lineDao.findActiveByCentreId(centre.id);
    const lanes: LaneStatusEntry[] = [];

    for (const line of lines) {
      // A line with no provider lane id is not visible to the provider at all,
      // so it has no lane to report against.
      const laneId = line.provider_lane_id?.trim();
      if (!laneId) continue;

      lanes.push(await this.describeLane(line.id, laneId, line.status));
    }

    if (lanes.length === 0) return;

    await this.outbox.enqueue({
      eventType: TajdeedEventType.LANE_STATUS,
      branchCode,
      payload: { heartbeat: true, lanes },
      centreId: centre.id,
    });
  }

  /**
   * Reports a single lane transition as it happens.
   *
   * The heartbeat alone would leave the provider's lane board up to five
   * minutes stale — showing a lane free while a car sits in it — so every
   * transition is pushed immediately and the snapshot stays on as the repair
   * mechanism for anything lost in between.
   *
   * Enqueue-only and never throws: releasing a lane is a side effect of an
   * operator finishing a job, and must not be able to fail that job.
   */
  async pushLaneChange(job: Job, status: LaneOccupancyStatus): Promise<void> {
    try {
      if (!job.line_id) return;

      const line = await this.lineDao.findActiveById(job.line_id);
      const laneId = line?.provider_lane_id?.trim();
      // A line the provider does not know about has no lane to report against.
      if (!line || !laneId) return;

      const centre = line.centre_id
        ? await this.centreDao.findActiveById(line.centre_id)
        : null;
      const branchCode = centre?.provider_branch_code?.trim();
      if (!branchCode) return;

      const entry: LaneStatusEntry = { lane_id: laneId, status };

      if (status === 'OCCUPIED') {
        const plate = job.vehicleRecord?.plate_number;
        if (plate) entry.plate_number = normalizePlate(plate);
        entry.started_at = (job.started_at ?? new Date()).toISOString();
      } else if (status === 'IDLE') {
        entry.cleared_at = new Date().toISOString();
      }

      await this.outbox.enqueue({
        eventType: TajdeedEventType.LANE_STATUS,
        branchCode,
        payload: entry,
        // Recorded so every event a job produced — both lane transitions and
        // the inspection result — is reachable from the job. Safe because the
        // duplicate guard only applies to INSPECTION_RESULT.
        jobId: job.id,
        centreId: line.centre_id ?? null,
        lineId: line.id,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to queue lane ${status} for job ${job.id}: ${(err as Error).message}`,
        LaneStatusService.context,
      );
    }
  }

  /**
   * One lane's state.
   *
   * OUT_OF_SERVICE is mapped from the line being administratively disabled,
   * which is the closest true equivalent IVIS holds — a deactivated line
   * cannot take work. Occupancy otherwise follows the active job: In Progress
   * means a vehicle is physically on the lane, whereas Pending only means one
   * is expected, so Pending is reported IDLE rather than overstating it.
   */
  private async describeLane(
    lineId: string,
    laneId: string,
    lineStatus: string,
  ): Promise<LaneStatusEntry> {
    if (lineStatus !== 'Active') {
      return { lane_id: laneId, status: 'OUT_OF_SERVICE' };
    }

    const active = await this.jobDao.findActiveByLineId(lineId);
    const inProgress = active.filter((job) => job.status === 'In Progress');

    if (inProgress.length === 0) {
      const status: LaneOccupancyStatus = 'IDLE';
      return { lane_id: laneId, status };
    }

    // Two cars cannot share a lane, so more than one In Progress job on it is
    // a data fault, not a state to report. findActiveByLineId orders newest
    // first, so the most recent arrival is reported — but the collision is
    // logged, because silently picking one hides the other from the provider's
    // queue board with nothing to indicate anything was dropped.
    if (inProgress.length > 1) {
      this.logger.warn(
        `Lane ${laneId} has ${inProgress.length} In Progress jobs (${inProgress
          .map((j) => `#J${j.job_id} ${j.vehicleRecord?.plate_number ?? '?'}`)
          .join(', ')}) — reporting the newest; resolve the duplicate`,
        LaneStatusService.context,
      );
    }

    const running = inProgress[0];

    const entry: LaneStatusEntry = {
      lane_id: laneId,
      status: 'OCCUPIED',
    };

    const plate = running.vehicleRecord?.plate_number;
    if (plate) entry.plate_number = normalizePlate(plate);
    if (running.started_at) {
      entry.started_at = new Date(running.started_at).toISOString();
    }

    return entry;
  }
}
