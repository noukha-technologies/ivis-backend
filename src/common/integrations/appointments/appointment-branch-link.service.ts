import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppLogger } from '../../logger/app.logger';
import { CentreDao } from '../../../modules/database/dao/centre.dao';
import { LineDao } from '../../../modules/database/dao/line.dao';
import { Line } from '../../../modules/database/entity/line.entity';
import { AppointmentApiClientService } from './appointment-api-client.service';
import { isAppointmentApiConfigured } from './appointment.constants';
import {
  AppointmentBranch,
  BranchOption,
  BranchStatusResult,
  BranchVerificationResult,
  LaneMappingPreview,
} from './appointment.types';

/**
 * Links an IVIS centre to its branch at the appointment provider.
 *
 * IVIS owns centre creation — a centre exists and operates regardless of the
 * provider, and creating one registers nothing upstream (there is no
 * POST /branches; branches are provisioned by the provider out of band). What
 * linking does is record WHICH already-provisioned branch this centre is.
 *
 * Auth is a single global key, so the branch directory is readable without any
 * per-centre credential: the operator picks a branch from the live list rather
 * than typing a code, which removes both the typo risk and the dependency on
 * the provider issuing a key per centre.
 *
 * Lanes are mapped onto existing lines rather than creating them, because
 * lines carry IVIS-only configuration (in_file_path, out_file_path) the
 * provider knows nothing about — silently creating half-configured lines would
 * be worse than reporting the mismatch.
 */
@Injectable()
export class AppointmentBranchLinkService {
  private static readonly context = 'AppointmentBranchLinkService';

  constructor(
    private readonly appointmentApi: AppointmentApiClientService,
    private readonly centreDao: CentreDao,
    private readonly lineDao: LineDao,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Every branch the provider holds, annotated for the centre picker: which
   * are already taken by another centre, and which may be linked in this
   * environment. Both are returned rather than filtered out, so the operator
   * can see why a branch is unavailable instead of wondering where it went.
   */
  async listBranches(centreId?: string): Promise<BranchOption[]> {
    if (!isAppointmentApiConfigured()) {
      throw new BadRequestException(
        'APPOINTMENT_API_KEY is not configured on the server, so the branch directory cannot be read.',
      );
    }

    const branches = await this.appointmentApi.fetchBranches();
    if (!branches) {
      throw new BadRequestException(
        'Could not reach the appointment provider, or the API key was rejected.',
      );
    }

    const linked = await this.centreDao.findAllWithProviderBranchCode();
    const takenBy = new Map(
      linked
        .filter((c) => c.id !== centreId)
        .map((c) => [
          (c.provider_branch_code ?? '').trim().toUpperCase(),
          c.code,
        ]),
    );

    // Every branch the provider returns is selectable. `taken_by_centre_code`
    // is informational only — it tells the operator a branch is already in use
    // so the choice is informed, but it does not block re-assignment.
    return branches.map((branch) => {
      const code = branch.branch_code.trim().toUpperCase();
      const takenByCentre = takenBy.get(code) ?? null;

      return {
        branch_code: branch.branch_code,
        name: branch.name,
        timezone: branch.timezone,
        lane_count: branch.lanes.length,
        taken_by_centre_code: takenByCentre,
        selectable: true,
        unavailable_reason: null,
      };
    });
  }

  /**
   * Read-only preview: confirms the branch exists and shows how its lanes
   * would map onto this centre's lines. Persists nothing, so the operator can
   * see the mapping before committing to it.
   */
  async verify(
    centreId: string,
    branchCode: string,
  ): Promise<BranchVerificationResult> {
    await this.requireCentre(centreId);
    const branch = await this.resolveBranch(branchCode);
    const lines = await this.lineDao.findActiveByCentreId(centreId);
    return this.buildVerification(branch, lines);
  }

  /**
   * Verifies, then persists the link: branch code and the lane→line mapping.
   * Rejects a branch code the provider does not return, so a bad value cannot
   * survive to the point where inspection pushes start failing.
   */
  async link(
    centreId: string,
    branchCode: string,
  ): Promise<BranchVerificationResult> {
    const centre = await this.requireCentre(centreId);

    // A branch already held by another centre is re-assignable: the operator
    // saw who holds it in the picker, so this is a deliberate move rather than
    // a mistake to block. The previous centre simply stops reading it.
    const existing = await this.centreDao.findByProviderBranchCode(branchCode);
    if (existing && existing.id !== centreId) {
      this.logger.warn(
        `Branch ${branchCode} moved from centre ${existing.code} to ${centre.code}`,
        AppointmentBranchLinkService.context,
      );
    }

    const branch = await this.resolveBranch(branchCode);
    const lines = await this.lineDao.findActiveByCentreId(centreId);
    const verification = this.buildVerification(branch, lines);

    for (const mapping of verification.lane_mappings) {
      if (!mapping.matched || !mapping.line_id) continue;
      const line = lines.find((l) => l.id === mapping.line_id);
      if (!line) continue;
      line.provider_lane_id = mapping.lane_id;
      await this.lineDao.save(line);
    }

    centre.provider_branch_code = branch.branch_code;
    await this.centreDao.save(centre);

    const mapped = verification.lane_mappings.filter((m) => m.matched).length;
    this.logger.log(
      `Linked centre ${centre.code} → branch ${branch.branch_code} (${mapped}/${branch.lanes.length} lanes mapped)`,
      AppointmentBranchLinkService.context,
    );

    return verification;
  }

  /** Removes the link. The centre keeps operating; it just stops pushing. */
  async unlink(centreId: string): Promise<void> {
    const centre = await this.requireCentre(centreId);
    const previous = centre.provider_branch_code;

    // Must be an explicit column update: TypeORM's save() skips properties set
    // to undefined, so assigning undefined would silently leave the old branch
    // code in place — and the next "set branch" would then look like a no-op.
    await this.centreDao.update(centreId, { provider_branch_code: null });

    const lines = await this.lineDao.findActiveByCentreId(centreId);
    for (const line of lines) {
      if (!line.provider_lane_id) continue;
      line.provider_lane_id = null;
      await this.lineDao.save(line);
    }

    this.logger.log(
      `Unlinked centre ${centre.code} from branch ${previous ?? '(none)'}`,
      AppointmentBranchLinkService.context,
    );
  }

  /**
   * Current link state plus any drift against the provider — a withdrawn lane,
   * a line with no mapping, a branch that no longer resolves. Reports only:
   * operator data is never silently overwritten.
   */
  async status(centreId: string): Promise<BranchStatusResult> {
    const centre = await this.requireCentre(centreId);
    const branchCode = centre.provider_branch_code?.trim();

    const result: BranchStatusResult = {
      centre_id: centre.id,
      centre_code: centre.code,
      linked: Boolean(branchCode),
      provider_branch_code: branchCode ?? null,
      drift: [],
    };

    if (!branchCode) {
      return result;
    }

    const branch = await this.appointmentApi.fetchBranch(branchCode);
    if (!branch) {
      result.drift.push(
        `Branch ${branchCode} is no longer returned by GET /branches — it may have been deactivated`,
      );
      return result;
    }

    const lines = await this.lineDao.findActiveByCentreId(centreId);
    const laneIds = new Set(branch.lanes.map((l) => l.lane_id.toUpperCase()));

    for (const line of lines) {
      const mapped = line.provider_lane_id?.trim().toUpperCase();
      if (!mapped) {
        result.drift.push(`Line ${line.code} has no lane mapping`);
      } else if (!laneIds.has(mapped)) {
        result.drift.push(
          `Line ${line.code} maps to lane ${mapped}, which no longer exists at branch ${branchCode}`,
        );
      }
    }

    const mappedLaneIds = new Set(
      lines
        .map((l) => l.provider_lane_id?.trim().toUpperCase())
        .filter((v): v is string => Boolean(v)),
    );
    for (const lane of branch.lanes) {
      if (!mappedLaneIds.has(lane.lane_id.toUpperCase())) {
        result.drift.push(
          `Lane ${lane.lane_id} (${lane.name}) exists at branch ${branchCode} but maps to no line`,
        );
      }
    }

    return result;
  }

  private async requireCentre(centreId: string) {
    const centre = await this.centreDao.findActiveById(centreId);
    if (!centre) {
      throw new NotFoundException(`Centre ${centreId} not found`);
    }
    return centre;
  }

  private async resolveBranch(branchCode: string): Promise<AppointmentBranch> {
    if (!isAppointmentApiConfigured()) {
      throw new BadRequestException(
        'APPOINTMENT_API_KEY is not configured on the server.',
      );
    }

    const branches = await this.appointmentApi.fetchBranches();
    if (!branches) {
      throw new BadRequestException(
        'Could not reach the appointment provider, or the API key was rejected.',
      );
    }

    const wanted = branchCode.trim().toUpperCase();
    const branch = branches.find(
      (b) => b.branch_code.trim().toUpperCase() === wanted,
    );

    if (!branch) {
      const visible = branches.map((b) => b.branch_code).join(', ') || 'none';
      throw new BadRequestException(
        `Branch ${wanted} does not exist at the appointment provider. Available: ${visible}.`,
      );
    }

    return branch;
  }

  /**
   * Matches lanes to lines by display_order — lane 1 to the first line, and so
   * on — which is the only ordering both systems share. An existing
   * provider_lane_id wins over positional matching, so re-linking is stable.
   * Anything unmatched is surfaced for the operator rather than guessed at.
   */
  private buildVerification(
    branch: AppointmentBranch,
    lines: Line[],
  ): BranchVerificationResult {
    const ordered = [...lines].sort(
      (a, b) => a.display_order - b.display_order,
    );
    const claimed = new Set<string>();

    const lane_mappings: LaneMappingPreview[] = branch.lanes.map(
      (lane, index) => {
        const byExisting = ordered.find(
          (l) =>
            l.provider_lane_id?.trim().toUpperCase() ===
            lane.lane_id.toUpperCase(),
        );
        const line = byExisting ?? ordered[index];

        if (line && !claimed.has(line.id)) {
          claimed.add(line.id);
          return {
            lane_id: lane.lane_id,
            lane_name: lane.name,
            line_id: line.id,
            line_code: line.code,
            matched: true,
          };
        }

        return {
          lane_id: lane.lane_id,
          lane_name: lane.name,
          line_id: null,
          line_code: null,
          matched: false,
        };
      },
    );

    return {
      branch_code: branch.branch_code,
      name: branch.name,
      timezone: branch.timezone,
      lanes: branch.lanes,
      lane_mappings,
      unmatched_lines: ordered
        .filter((l) => !claimed.has(l.id))
        .map((l) => ({ line_id: l.id, line_code: l.code })),
    };
  }
}
