import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { CameraStatus } from '../../../common/enums/camera.enums';
import type {
  DashboardCameraStatusRaw,
  DashboardDayWindows,
  DashboardKpiRaw,
  DashboardLineStatusRaw,
  IDashboardDao,
} from '../../dashboard/dao/dashboard.dao.interface';
import { Camera } from '../entity/camera.entity';
import { Job } from '../entity/job.entity';
import { Line } from '../entity/line.entity';

@Injectable()
export class DashboardDao implements IDashboardDao {
  constructor(private readonly dataSource: DataSource) {}

  async getKpiCounts(
    centreId: string,
    windows: DashboardDayWindows,
  ): Promise<DashboardKpiRaw> {
    const row = await this.dataSource
      .getRepository(Job)
      .createQueryBuilder('job')
      .select(
        `COUNT(*) FILTER (
          WHERE job.created_at >= :todayStart AND job.created_at < :todayEnd
        )`,
        'vehicles_today',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE job.created_at >= :yesterdayStart AND job.created_at < :yesterdayEnd
        )`,
        'vehicles_yesterday',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE job.overall_result = 'Passed'
            AND job.completed_at >= :todayStart AND job.completed_at < :todayEnd
        )`,
        'pass_today',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE job.overall_result = 'Passed'
            AND job.completed_at >= :yesterdayStart AND job.completed_at < :yesterdayEnd
        )`,
        'pass_yesterday',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE job.overall_result = 'Failed'
            AND job.completed_at >= :todayStart AND job.completed_at < :todayEnd
        )`,
        'fail_today',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE job.overall_result = 'Failed'
            AND job.completed_at >= :yesterdayStart AND job.completed_at < :yesterdayEnd
        )`,
        'fail_yesterday',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE job.status = 'In Progress')`,
        'in_progress_today',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE job.started_at >= :yesterdayStart AND job.started_at < :yesterdayEnd
        )`,
        'in_progress_yesterday',
      )
      .where('job.is_deleted = false')
      .andWhere('job.centre_id = :centreId', { centreId })
      .setParameters({
        todayStart: windows.todayStart,
        todayEnd: windows.todayEnd,
        yesterdayStart: windows.yesterdayStart,
        yesterdayEnd: windows.yesterdayEnd,
      })
      .getRawOne<Record<string, string>>();

    return {
      vehicles_today: Number(row?.vehicles_today ?? 0),
      vehicles_yesterday: Number(row?.vehicles_yesterday ?? 0),
      pass_today: Number(row?.pass_today ?? 0),
      pass_yesterday: Number(row?.pass_yesterday ?? 0),
      fail_today: Number(row?.fail_today ?? 0),
      fail_yesterday: Number(row?.fail_yesterday ?? 0),
      in_progress_today: Number(row?.in_progress_today ?? 0),
      in_progress_yesterday: Number(row?.in_progress_yesterday ?? 0),
    };
  }

  async getLineInProgressCounts(
    centreId: string,
  ): Promise<DashboardLineStatusRaw[]> {
    const rows = await this.dataSource
      .getRepository(Line)
      .createQueryBuilder('line')
      .leftJoin(
        Job,
        'job',
        `job.line_id = line.id
          AND job.is_deleted = false
          AND job.status = 'In Progress'
          AND job.centre_id = :centreId`,
        { centreId },
      )
      .select('line.id', 'id')
      .addSelect('line.name', 'name')
      .addSelect('COUNT(job.id)', 'in_progress')
      .where('line.is_deleted = false')
      .andWhere('line.centre_id = :centreId', { centreId })
      .andWhere(`line.status = 'Active'`)
      .groupBy('line.id')
      .addGroupBy('line.name')
      .addGroupBy('line.display_order')
      .orderBy('line.display_order', 'ASC')
      .addOrderBy('line.name', 'ASC')
      .getRawMany<{ id: string; name: string; in_progress: string }>();

    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      in_progress: Number(row.in_progress ?? 0),
    }));
  }

  async getCameraStatus(centreId: string): Promise<DashboardCameraStatusRaw> {
    const row = await this.dataSource
      .getRepository(Camera)
      .createQueryBuilder('camera')
      .innerJoin(
        'camera.lineMappings',
        'mapping',
        'mapping.is_deleted = false',
      )
      .innerJoin('mapping.line', 'line', 'line.is_deleted = false')
      .select('COUNT(DISTINCT camera.id)', 'total')
      .addSelect(
        `COUNT(DISTINCT camera.id) FILTER (WHERE camera.health_status = :online)`,
        'active',
      )
      .where('camera.is_deleted = false')
      .andWhere('line.centre_id = :centreId', { centreId })
      .setParameters({ online: CameraStatus.ONLINE })
      .getRawOne<{ total: string; active: string }>();

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
    };
  }
}
