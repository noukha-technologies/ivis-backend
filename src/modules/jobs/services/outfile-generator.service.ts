import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppLogger } from '../../../common/logger/app.logger';
import { isProduction } from '../../../common/config/env.config';
import { getUploadRoot } from '../../../common/utils/file-storage.util';
import { buildOutFileName } from '../../../common/shared/files/inspection-file-name.util';
import { AdminPcDao } from '../../database/dao/admin-pc.dao';
import { JobDao } from '../../database/dao/job.dao';

export type OutfileResult = 'pass' | 'fail';

/**
 * Generates a synthetic Admin PC OUT file for a plate.
 *
 * DEVELOPMENT TOOL. The real OUT file is written by the inspection rig, which
 * is not present outside a centre — so without this there is no way to exercise
 * the second half of the pipeline (parse → job results → submit → provider
 * push) on a dev machine.
 *
 * The content is modelled on a real rig file, section for section, so the
 * existing parser and the INSPECTION_RESULT mapper see exactly what they would
 * in production. Nothing here is a shortcut around them: the file is written to
 * the configured OUT folder and the normal watcher picks it up on its next
 * tick, the same as a rig-produced file.
 *
 * Refused in production — a fabricated inspection result is exactly the thing
 * that must never reach a real vehicle's record.
 */
@Injectable()
export class OutfileGeneratorService {
  private static readonly context = 'OutfileGeneratorService';

  constructor(
    private readonly adminPcDao: AdminPcDao,
    private readonly jobDao: JobDao,
    private readonly logger: AppLogger,
  ) {}

  async generate(
    plateNumber: string,
    result: OutfileResult = 'pass',
  ): Promise<{ name: string; path: string; plate: string; result: string }> {
    if (isProduction()) {
      throw new BadRequestException(
        'OUT file generation is a development tool and is disabled in production.',
      );
    }

    const plate = plateNumber.trim().toUpperCase();
    if (!plate) {
      throw new BadRequestException('plate_number is required');
    }

    // Resolve the folder the watcher is actually scanning, so the file lands
    // where it will be seen rather than somewhere plausible.
    const dir = await this.resolveOutFolder(plate);
    const name = buildOutFileName(plate);
    const fullPath = path.join(dir, name);

    const content = this.buildContent(plate, result);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');

    this.logger.log(
      `Generated ${result.toUpperCase()} OUT file for ${plate} → ${fullPath}`,
      OutfileGeneratorService.context,
    );

    return { name, path: fullPath, plate, result };
  }

  /**
   * The OUT folder of the Admin PC handling this plate's job, falling back to
   * any configured Admin PC. A generated file in an unwatched folder would
   * look like success and do nothing, so an unresolvable folder is an error.
   */
  private async resolveOutFolder(plate: string): Promise<string> {
    const job = await this.jobDao
      .createQueryBuilder('job')
      .leftJoin('job.vehicleRecord', 'vr')
      .leftJoinAndSelect('job.adminPc', 'adminPc')
      .where('job.is_deleted = false')
      .andWhere('vr.plate_number = :plate', { plate })
      .orderBy('job.created_at', 'DESC')
      .getOne();

    const fromJob = job?.adminPc?.out_file_path?.trim();
    if (fromJob) return fromJob;

    const anyPc = await this.adminPcDao.findOne({
      where: { is_deleted: false },
    });
    const fromPc = anyPc?.out_file_path?.trim();
    if (fromPc) return fromPc;

    const fallback = process.env.OUT_FILE_DIR?.trim();
    if (fallback) return fallback;

    return path.join(getUploadRoot(), 'out-files');
  }

  /**
   * Builds the INI. Mirrors the rig's real layout: per-rig sections plus the
   * flattened `FlatResults` block, which is the section deriveOverallResult
   * reads to decide pass or fail.
   *
   * On `fail` the brake rig is the one that fails — it is the section the
   * provider's payload carries in most detail, so a failing file exercises the
   * REJECTED path with a defect the customer report can actually name.
   */
  private buildContent(plate: string, result: OutfileResult): string {
    const failing = result === 'fail';
    const brake = failing ? 'fail' : 'pass';
    // A failing brake drags the axle deceleration below the 50% limit that
    // BDElimitInfo declares, so the numbers agree with the verdict rather than
    // reporting a pass-looking measurement next to a fail flag.
    const decel = failing ? '38' : '73';
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Muscat',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(now);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Muscat',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
      .format(now)
      .toLowerCase();

    const sections: [string, [string, string][]][] = [
      [
        'GenCarInfo',
        [
          ['LicenceNo', plate],
          ['Address', 'Mr.'],
          ['Name', 'Generated'],
          ['ChassisNo', ''],
          ['Color', ''],
          ['ManufacYear', ''],
          ['Maker', ''],
          ['InspectorName', '11627'],
          ['VehicleCategory', 'Car'],
          ['VehicleType', 'SALOON'],
          ['ExhaustType', '.Petrol'],
          ['NumberOfAxles', '2'],
          ['Remark1', failing ? 'Brake efficiency below limit' : ''],
          ['Remark2', ''],
          ['Remark3', ''],
          ['SSP_Status', 'ToCheck'],
          ['FWT_Status', 'ToCheck'],
          ['BDE_Status', 'ToCheck'],
          ['AGT_Status', 'ToCheck'],
          ['VEH_Status', 'ToCheck'],
        ],
      ],
      [
        'DateTime',
        [
          ['Date', date],
          ['Time', time],
          ['ReTestCount', '0'],
        ],
      ],
      ['SSPfront', [['TrackValue', '6.2']]],
      ['SSPrear', [['TrackValue', '-2']]],
      ['SSPTestResult', [['SSPgenResult', 'pass']]],
      [
        'FWTfront',
        [
          ['WeightLe', '389'],
          ['WeightRi', '420'],
          ['ErrResultLe', 'pass'],
          ['ErrResultRi', 'pass'],
        ],
      ],
      [
        'FWTrear',
        [
          ['WeightLe', '261'],
          ['WeightRi', '277'],
          ['ErrResultLe', 'pass'],
          ['ErrResultRi', 'pass'],
        ],
      ],
      ['FWTTestResult', [['FWTgenResult', 'pass']]],
      [
        'BRKSbr1',
        [
          ['MaxForceLe', failing ? '1420' : '2725'],
          ['MaxForceRi', failing ? '1380' : '2654'],
          ['AxleWeight', '809'],
          ['AxleDecel', decel],
          ['AxleErrDecel', brake],
        ],
      ],
      [
        'BRKSbr2',
        [
          ['MaxForceLe', failing ? '1105' : '2133'],
          ['MaxForceRi', failing ? '1160' : '2211'],
          ['AxleWeight', '538'],
          ['AxleDecel', failing ? '41' : '82'],
          ['AxleErrDecel', brake],
        ],
      ],
      [
        'BRKHbr2',
        [
          ['MaxForceLe', '1841'],
          ['MaxForceRi', '1970'],
          ['AxleWeight', '538'],
          ['AxleDecel', '72'],
          ['AxleErrDecel', 'pass'],
        ],
      ],
      [
        'TestResult',
        [
          ['DecelEmptySbr', decel],
          ['DecelEmptyHbr', '28'],
          ['WeightEmpty', '1347'],
        ],
      ],
      [
        'BDETestResult',
        [
          ['BDEgenResult', brake],
          ['BDE_BRKSbrErrDecel_empt', brake],
          ['BDE_BRKHbrErrDecel_empt', 'pass'],
        ],
      ],
      [
        'NOCTestResult',
        [
          ['ExhMaxSoundLevelMax', '104.9'],
          ['ExhTestResult', 'pass'],
        ],
      ],
      [
        'AGTTestResult',
        [
          ['CO', '0.04'],
          ['HC', '20'],
          ['CO2', '14.0'],
          ['NO', '----'],
          ['RPM', '800#'],
          ['AGTTestResult', 'pass'],
        ],
      ],
      ['SSPlimitInfo', [['SSP_Limit', '10']]],
      [
        'BDElimitInfo',
        [
          ['BDE_SBrDecel_1', '50'],
          ['BDE_PBrDecel_1', '16'],
        ],
      ],
      [
        'AGTlimitInfo',
        [
          ['AGT_HcMax', '600'],
          ['AGT_CoMax', '4.5'],
        ],
      ],
    ];

    const lines: string[] = [];
    for (const [name, entries] of sections) {
      lines.push(`[${name}]`);
      for (const [key, value] of entries) lines.push(`${key}=${value}`);
      lines.push('');
    }

    // FlatResults is <Section>_<Key> for every measured section, and is what
    // deriveOverallResult scans — a file without it parses but yields no
    // overall verdict, so it is built from the same data rather than by hand.
    const measured = new Set([
      'DateTime',
      'SSPfront',
      'SSPrear',
      'SSPTestResult',
      'FWTfront',
      'FWTrear',
      'FWTTestResult',
      'BRKSbr1',
      'BRKSbr2',
      'BRKHbr2',
      'TestResult',
      'BDETestResult',
      'NOCTestResult',
      'AGTTestResult',
    ]);
    lines.push('[FlatResults]');
    for (const [name, entries] of sections) {
      if (!measured.has(name)) continue;
      for (const [key, value] of entries) lines.push(`${name}_${key}=${value}`);
    }
    lines.push('');

    return lines.join('\r\n');
  }
}
