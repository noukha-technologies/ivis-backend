import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { CameraStatus } from '../../../common/enums/camera.enums';
import type {
  DashboardCameraStatusRaw,
  DashboardDayWindows,
  DashboardInProgressJobRaw,
  DashboardKpiRaw,
  DashboardLineStatusRaw,
  IDashboardDao,
} from '../../dashboard/dao/dashboard.dao.interface';
import { AnprCapture } from '../entity/anpr-capture.entity';
import { Appointment } from '../entity/appointment.entity';
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

  async getInProgressJobs(
    centreId: string,
    limit: number,
  ): Promise<DashboardInProgressJobRaw[]> {
    const rows = await this.dataSource
      .getRepository(Job)
      .createQueryBuilder('job')
      .innerJoin('job.vehicleRecord', 'vehicleRecord')
      .leftJoin('job.line', 'line')
      .leftJoin('job.customer', 'customer')
      .select('job.id', 'job_id')
      .addSelect('vehicleRecord.plate_number', 'plate_number')
      .addSelect('customer.owner_name', 'customer_name')
      .addSelect('line.name', 'line_name')
      .addSelect('job.started_at', 'started_at')
      .where('job.is_deleted = false')
      .andWhere('job.centre_id = :centreId', { centreId })
      .andWhere(`job.status = 'In Progress'`)
      .orderBy('job.started_at', 'DESC', 'NULLS LAST')
      .limit(limit)
      .getRawMany<{
        job_id: string;
        plate_number: string;
        customer_name: string | null;
        line_name: string | null;
        started_at: Date | null;
      }>();

    return rows.map((row) => ({
      job_id: String(row.job_id),
      plate_number: row.plate_number,
      customer_name: row.customer_name,
      line_name: row.line_name,
      started_at: row.started_at,
    }));
  }

  async getLastAnprCaptureAt(centreId: string): Promise<Date | null> {
    const row = await this.dataSource
      .getRepository(AnprCapture)
      .createQueryBuilder('capture')
      .innerJoin('capture.line', 'line')
      .select('MAX(capture.capture_time)', 'last_capture_at')
      .where('line.centre_id = :centreId', { centreId })
      .getRawOne<{ last_capture_at: Date | null }>();

    return row?.last_capture_at ?? null;
  }

  async getLastAppointmentAt(centreId: string): Promise<Date | null> {
    const row = await this.dataSource
      .getRepository(Appointment)
      .createQueryBuilder('appointment')
      .select('MAX(appointment.created_at)', 'last_appointment_at')
      .where('appointment.is_deleted = false')
      .andWhere('appointment.centre_id = :centreId', { centreId })
      .getRawOne<{ last_appointment_at: Date | null }>();

    return row?.last_appointment_at ?? null;
  }

  async getAppointmentsTodayCount(
    centreId: string,
    windows: DashboardDayWindows,
  ): Promise<number> {
    const row = await this.dataSource
      .getRepository(Appointment)
      .createQueryBuilder('appointment')
      .select('COUNT(*)', 'total')
      .where('appointment.is_deleted = false')
      .andWhere('appointment.centre_id = :centreId', { centreId })
      .andWhere('appointment.created_at >= :todayStart', { todayStart: windows.todayStart })
      .andWhere('appointment.created_at < :todayEnd', { todayEnd: windows.todayEnd })
      .getRawOne<{ total: string }>();

    return Number(row?.total ?? 0);
  }
}
