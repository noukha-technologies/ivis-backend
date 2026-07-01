import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppLogger } from '../../../common/logger/app.logger';
import { getUploadRoot } from '../../../common/utils/file-storage.util';
import { Job } from '../../database/entity/job.entity';

/** Tests requested in the IN file (static for now — mirrors the sample). */
const REQUESTED_TESTS = ['SSP', 'FWT', 'BDE', 'AGT', 'HLT', 'NOC', 'VEH'];

@Injectable()
export class InfileGeneratorService {
  private static readonly context = 'InfileGeneratorService';

  constructor(private readonly logger: AppLogger) {}

  /**
   * Build the `[GenCarInfo]` IN file for a job and write it to the Admin PC's
   * IN folder. Returns the written file name + full path (stored on the job).
   * Folder resolution: job's Admin PC `in_file_path` → env `IN_FILE_DIR` →
   * `<uploadRoot>/in-files`.
   */
  async generateForJob(job: Job): Promise<{ name: string; path: string }> {
    const plate = job.vehicleRecord?.plate_number ?? `JOB-${job.job_id}`;
    const customer = job.customer;
    const record = job.vehicleRecord;

    const lines: Array<[string, string]> = [
      ['LicenceNo', plate],
      ['Address', 'Mr.'],
      ['Name', customer?.customer_name ?? ''],
      ['ZipCode', ''],
      ['City', ''],
      ['Street', ''],
      ['HouseNo', ''],
      ['ChassisNo', record?.chassis_no ?? ''],
      ['ModelCode', record?.vehicle_model ?? ''],
      ['Color', record?.vehicle_color ?? record?.plate_color ?? ''],
      ['ManufacYear', ''],
      ['Year', ''],
      ['Maker', record?.vehicle_make ?? ''],
      ['InspectorName', ''],
      ['VehicleCategory', ''],
      ['VehicleType', record?.vehicle_type ?? ''],
      ['ExhaustType', ''],
      ['InspectionNo', String(job.job_id)],
      ['Phone', ''],
      ['Mobile', customer?.customer_phone_number ?? ''],
      ['NumberOfAxles', '2'],
    ];
    for (let i = 1; i <= 8; i += 1) lines.push([`ParkingBrakePos_${i}`, i === 2 ? 'true' : 'false']);
    lines.push(['4WD', 'false']);
    lines.push(['Remark1', ''], ['Remark2', ''], ['Remark3', '']);
    for (const test of REQUESTED_TESTS) lines.push([`${test}_Status`, 'ToCheck']);

    const content =
      '[GenCarInfo]\r\n' + lines.map(([k, v]) => `${k}=${v}`).join('\r\n') + '\r\n';

    const dir =
      job.adminPc?.in_file_path?.trim() ||
      process.env.IN_FILE_DIR?.trim() ||
      path.join(getUploadRoot(), 'in-files');
    const name = `IN_JOB_${job.job_id}_${plate.replace(/[^A-Za-z0-9-]/g, '')}.data`;
    const fullPath = path.join(dir, name);

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
      this.logger.log(`IN file written: ${fullPath}`, InfileGeneratorService.context);
    } catch (err) {
      // Network share may be unavailable in dev — log and continue with the
      // recorded path so the flow isn't blocked.
      this.logger.warn(
        `Failed to write IN file to ${fullPath}: ${(err as Error).message}`,
        InfileGeneratorService.context,
      );
    }

    return { name, path: fullPath };
  }
}
