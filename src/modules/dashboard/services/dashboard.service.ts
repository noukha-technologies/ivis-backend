import { BadRequestException, Injectable } from '@nestjs/common';

import { isGlobalScope } from '../../../common/constants/access-scope';
import type { UserContext } from '../../../common/dto/auth.dto';
import type { DashboardOverviewResponseDto } from '../../../common/dto/dashboard.dto';
import { ResourceNotFoundException } from '../../../common/exceptions/custom.exception';
import { MasterScopeService } from '../../../common/services/master-scope.service';
import { CentreDao } from '../../database/dao/centre.dao';
import { DashboardDao } from '../../database/dao/dashboard.dao';
import type { DashboardDayWindows } from '../dao/dashboard.dao.interface';

/** Asia/Muscat is UTC+4 year-round (no DST). */
const MUSCAT_OFFSET_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardDao: DashboardDao,
    private readonly centreDao: CentreDao,
    private readonly masterScope: MasterScopeService,
  ) {}

  async getOverview(
    actor: UserContext,
    queryCentreId?: string,
  ): Promise<DashboardOverviewResponseDto> {
    const centreId = await this.resolveCentreId(actor, queryCentreId);
    const windows = this.getMuscatDayWindows();

    const [kpisRaw, lines, cameras] = await Promise.all([
      this.dashboardDao.getKpiCounts(centreId, windows),
      this.dashboardDao.getLineInProgressCounts(centreId),
      this.dashboardDao.getCameraStatus(centreId),
    ]);

    return {
      centre_id: centreId,
      kpis: {
        vehicles_today: this.toMetric(
          kpisRaw.vehicles_today,
          kpisRaw.vehicles_yesterday,
        ),
        pass: this.toMetric(kpisRaw.pass_today, kpisRaw.pass_yesterday),
        fail: this.toMetric(kpisRaw.fail_today, kpisRaw.fail_yesterday),
        in_progress: this.toMetric(
          kpisRaw.in_progress_today,
          kpisRaw.in_progress_yesterday,
        ),
      },
      lines,
      cameras,
    };
  }

  private async resolveCentreId(
    actor: UserContext,
    queryCentreId?: string,
  ): Promise<string> {
    const scopedCentreId = this.masterScope.resolveCentreFilter(actor.user);

    if (!isGlobalScope(actor.user.access_scope)) {
      if (!scopedCentreId) {
        throw new BadRequestException(
          'Your account is not assigned to a centre.',
        );
      }
      return scopedCentreId;
    }

    if (!queryCentreId) {
      throw new BadRequestException('centre_id is required.');
    }

    const centre = await this.centreDao.findActiveById(queryCentreId);
    if (!centre) {
      throw new ResourceNotFoundException('Centre', queryCentreId);
    }
    return centre.id;
  }

  private toMetric(today: number, yesterday: number) {
    return {
      today,
      yesterday,
      change_percent:
        yesterday === 0
          ? null
          : Math.round(((today - yesterday) / yesterday) * 100),
    };
  }

  /** Today / yesterday calendar bounds in Asia/Muscat, returned as UTC Date instants. */
  private getMuscatDayWindows(): DashboardDayWindows {
    const muscatNow = new Date(Date.now() + MUSCAT_OFFSET_MS);
    const y = muscatNow.getUTCFullYear();
    const m = muscatNow.getUTCMonth();
    const d = muscatNow.getUTCDate();

    const todayStart = new Date(Date.UTC(y, m, d) - MUSCAT_OFFSET_MS);
    const todayEnd = new Date(Date.UTC(y, m, d + 1) - MUSCAT_OFFSET_MS);
    const yesterdayStart = new Date(Date.UTC(y, m, d - 1) - MUSCAT_OFFSET_MS);
    const yesterdayEnd = todayStart;

    return { todayStart, todayEnd, yesterdayStart, yesterdayEnd };
  }
}
