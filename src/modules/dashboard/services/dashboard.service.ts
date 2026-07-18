import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { isGlobalScope } from '../../../common/constants/access-scope';
import type { UserContext } from '../../../common/dto/auth.dto';
import type { DashboardOverviewResponseDto } from '../../../common/dto/dashboard.dto';
import { ResourceNotFoundException } from '../../../common/exceptions/custom.exception';
import { MasterScopeService } from '../../../common/services/master-scope.service';
import { CentreDao } from '../../database/dao/centre.dao';
import { DashboardDao } from '../../database/dao/dashboard.dao';
import type { DashboardDayWindows } from '../dao/dashboard.dao.interface';

// Most recent in-progress jobs shown on the dashboard's Line card — kept
// small since this is a glance, not a work queue (Job Management already
// covers the full list).
const IN_PROGRESS_JOBS_LIMIT = 6;

// Fixed-offset arithmetic (not Intl.DateTimeFormat) — equivalent to
// OmanTimeZone ('Asia/Muscat', common/utils/util.ts) since Oman is UTC+4
// year-round with no DST, so a constant offset is always correct here.
const MUSCAT_OFFSET_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardDao: DashboardDao,
    private readonly centreDao: CentreDao,
    private readonly masterScope: MasterScopeService,
    private readonly dataSource: DataSource,
  ) { }

  async getOverview(actor: UserContext, queryCentreId?: string): Promise<DashboardOverviewResponseDto> {
    const centreId = await this.resolveCentreId(actor, queryCentreId);
    const windows = this.getMuscatDayWindows();

    const [
      kpisRaw,
      lines,
      cameras,
      inProgressJobs,
      lastAnprCaptureAt,
      lastAppointmentAt,
      appointmentsToday,
    ] = await Promise.all([
      this.dashboardDao.getKpiCounts(centreId, windows),
      this.dashboardDao.getLineInProgressCounts(centreId),
      this.dashboardDao.getCameraStatus(centreId),
      this.dashboardDao.getInProgressJobs(centreId, IN_PROGRESS_JOBS_LIMIT),
      this.dashboardDao.getLastAnprCaptureAt(centreId),
      this.dashboardDao.getLastAppointmentAt(centreId),
      this.dashboardDao.getAppointmentsTodayCount(centreId, windows),
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
      in_progress_jobs: inProgressJobs,
      system_health: {
        database_connected: this.dataSource.isInitialized,
        anpr_cameras_active: cameras.active,
        anpr_cameras_total: cameras.total,
        last_anpr_capture_at: lastAnprCaptureAt,
        last_appointment_at: lastAppointmentAt,
        appointments_today: appointmentsToday,
        jobs_today: kpisRaw.vehicles_today,
      },
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
