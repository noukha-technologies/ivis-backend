import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppLogger } from '../../logger/app.logger';
import { CentreDao } from '../../../modules/database/dao/centre.dao';
import { LineDao } from '../../../modules/database/dao/line.dao';
import { JobDao } from '../../../modules/database/dao/job.dao';
import { AppointmentApiClientService } from './appointment-api-client.service';

/** One selectable lane, annotated with what currently holds it. */
export interface LaneOption {
  lane_id: string;
  name: string;
  /** IVIS line code currently mapped to this lane, if any. */
  held_by_line_code: string | null;
  held_by_line_id: string | null;
  /** True when the holding line has an active job, so it cannot be swapped. */
  locked: boolean;
  lock_reason: string | null;
}

/**
 * Assigns provider lane ids to IVIS lines, and answers what a line may be
 * assigned to.
 *
 * The lane id is what inspection results are pushed against, so it is not a
 * free-text field: changing it under a live job would send that job's result to
 * the wrong lane at the provider, which we cannot undo from our side. Two rules
 * follow, and both are enforced here rather than in the UI:
 *
 *   1. A line with an active job (Pending or In Progress) cannot have its lane
 *      changed at all.
 *   2. Taking a lane another line holds is a SWAP, not an overwrite — the two
 *      lines exchange ids so neither is left unmapped. It requires explicit
 *      confirmation, and is refused if either line has an active job.
 */
@Injectable()
export class AppointmentLaneAssignmentService {
  private static readonly context = 'AppointmentLaneAssignmentService';

  constructor(
    private readonly appointmentApi: AppointmentApiClientService,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly jobDao: JobDao,
    private readonly logger: AppLogger,
  ) {}

  /**
   * The lanes a centre's branch offers, annotated with the line holding each
   * and whether that line is locked by an active job.
   *
   * Read live from the provider rather than a local master: the lanes belong to
   * them, and a mirrored copy would go stale the moment a lane is added or
   * retired.
   */
  async listLanes(centreId: string): Promise<LaneOption[]> {
    const centre = await this.centreDao.findActiveById(centreId);
    if (!centre) {
      throw new NotFoundException(`Centre ${centreId} not found`);
    }

    const branchCode = centre.provider_branch_code?.trim();
    if (!branchCode) {
      // Not an error: an unlinked centre simply has no lanes to offer yet.
      return [];
    }

    const branch = await this.appointmentApi.fetchBranch(branchCode);
    if (!branch) {
      throw new BadRequestException(
        `Branch ${branchCode} could not be read from the appointment provider.`,
      );
    }

    const lines = await this.lineDao.findActiveByCentreId(centreId);

    return Promise.all(
      branch.lanes.map(async (lane) => {
        const holder = lines.find(
          (l) =>
            l.provider_lane_id?.trim().toUpperCase() ===
            lane.lane_id.toUpperCase(),
        );

        const activeJobs = holder
          ? await this.jobDao.findActiveByLineId(holder.id)
          : [];

        return {
          lane_id: lane.lane_id,
          name: lane.name,
          held_by_line_code: holder?.code ?? null,
          held_by_line_id: holder?.id ?? null,
          locked: activeJobs.length > 0,
          lock_reason:
            activeJobs.length > 0
              ? `${holder?.code} has an active job (#J${String(activeJobs[0].job_id).padStart(2, '0')})`
              : null,
        };
      }),
    );
  }

  /**
   * Assigns a lane to a line, swapping with the current holder when asked.
   *
   * Throws ConflictException with a structured body when the lane is held and
   * `confirmSwap` was not set, so the client can prompt and retry.
   */
  async assignLane(
    lineId: string,
    laneId: string | null,
    confirmSwap = false,
  ): Promise<{ swapped: boolean; with_line_code: string | null }> {
    const line = await this.lineDao.findActiveById(lineId);
    if (!line) {
      throw new NotFoundException(`Line ${lineId} not found`);
    }

    const nextLane = laneId?.trim().toUpperCase() || null;
    if ((line.provider_lane_id ?? null) === nextLane) {
      return { swapped: false, with_line_code: null };
    }

    await this.assertNoActiveJob(line.id, line.code);

    // Clearing needs no lane lookup or swap.
    if (!nextLane) {
      line.provider_lane_id = null;
      await this.lineDao.save(line);
      this.logger.log(
        `Cleared lane mapping on line ${line.code}`,
        AppointmentLaneAssignmentService.context,
      );
      return { swapped: false, with_line_code: null };
    }

    const siblings = await this.lineDao.findActiveByCentreId(line.centre_id);
    const holder = siblings.find(
      (l) =>
        l.id !== line.id &&
        l.provider_lane_id?.trim().toUpperCase() === nextLane,
    );

    // Lane is free — assign directly, no confirmation needed.
    if (!holder) {
      line.provider_lane_id = nextLane;
      await this.lineDao.save(line);
      this.logger.log(
        `Assigned lane ${nextLane} to line ${line.code}`,
        AppointmentLaneAssignmentService.context,
      );
      return { swapped: false, with_line_code: null };
    }

    if (!confirmSwap) {
      throw new ConflictException({
        conflict: 'LANE_TAKEN',
        lane_id: nextLane,
        held_by: { line_id: holder.id, line_code: holder.code },
        message: `Lane ${nextLane} is currently assigned to ${holder.code}. Swap the lanes between ${line.code} and ${holder.code}?`,
      });
    }

    // Swapping touches the other line too, so it must be free as well —
    // otherwise fixing one line would break another.
    await this.assertNoActiveJob(holder.id, holder.code);

    const previous = line.provider_lane_id ?? null;
    line.provider_lane_id = nextLane;
    holder.provider_lane_id = previous;

    // Exchange rather than overwrite: neither line is left unmapped, and the
    // pair never passes through a state where both hold the same lane.
    await this.lineDao.save(holder);
    await this.lineDao.save(line);

    this.logger.log(
      `Swapped lanes: ${line.code} → ${nextLane}, ${holder.code} → ${previous ?? 'none'}`,
      AppointmentLaneAssignmentService.context,
    );

    return { swapped: true, with_line_code: holder.code };
  }

  /**
   * Refuses the change while the line carries an active job. Pending counts:
   * its IN file already names the current lane, so the OUT file answering it
   * would arrive against a lane the line no longer claims.
   */
  private async assertNoActiveJob(
    lineId: string,
    lineCode: string,
  ): Promise<void> {
    const jobs = await this.jobDao.findActiveByLineId(lineId);
    if (jobs.length === 0) return;

    const label = `#J${String(jobs[0].job_id).padStart(2, '0')}`;
    throw new BadRequestException(
      `Line ${lineCode} has an active job (${label}, ${jobs[0].status}). Complete or reassign it before changing the lane.`,
    );
  }
}
