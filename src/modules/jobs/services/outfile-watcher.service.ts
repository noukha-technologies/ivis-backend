import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppLogger } from '../../../common/logger/app.logger';
import { deriveOverallResult, parseIni } from '../../../common/shared/files/ini-parser.util';
import { AdminPcDao } from '../../database/dao/admin-pc.dao';
import { JobDao } from '../../database/dao/job.dao';

/**
 * Watches each Admin PC's OUT folder (configured in Configuration → Admin PC
 * Set-up) for result files, parses the INI, matches the job by plate
 * (`LicenceNo`), and stores the parsed sections + overall result on the job.
 * Mirrors the ANPR FTP-watcher pattern (interval poll + processed-file cursor).
 * Disable with `OUT_FILE_WATCH_DISABLED=true`.
 */
@Injectable()
export class OutfileWatcherService {
  private static readonly context = 'OutfileWatcherService';
  private readonly processed = new Set<string>();

  constructor(
    private readonly adminPcDao: AdminPcDao,
    private readonly jobDao: JobDao,
    private readonly logger: AppLogger,
  ) {}

  @Interval(5000)
  async tick(): Promise<void> {
    if (process.env.OUT_FILE_WATCH_DISABLED === 'true') return;
    try {
      const adminPcs = await this.adminPcDao.find({ where: { is_deleted: false } });
      for (const pc of adminPcs) {
        const dir = pc.out_file_path?.trim();
        if (dir) await this.scanFolder(dir);
      }
    } catch (err) {
      this.logger.warn(`OUT watcher cycle failed: ${(err as Error).message}`, OutfileWatcherService.context);
    }
  }

  private async scanFolder(dir: string): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return; // folder not reachable (common in dev) — skip silently
    }

    for (const file of files) {
      if (!/\.(res\.txt|txt|res)$/i.test(file)) continue;
      const key = `${dir}:${file}`;
      if (this.processed.has(key)) continue;

      const fullPath = path.join(dir, file);
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        const parsed = parseIni(content);
        const plate = parsed['GenCarInfo']?.['LicenceNo']?.trim();
        if (!plate) {
          this.processed.add(key);
          continue;
        }

        const job = await this.jobDao
          .createQueryBuilder('job')
          .leftJoinAndSelect('job.vehicleRecord', 'vr')
          .where('job.is_deleted = false')
          .andWhere('job.status = :status', { status: 'In Progress' })
          .andWhere('vr.plate_number = :plate', { plate })
          .orderBy('job.created_at', 'DESC')
          .getOne();

        if (!job) continue; // no matching in-progress job yet — retry next cycle

        job.test_results = parsed;
        job.outfile_name = file;
        job.outfile_path = fullPath;
        const overall = deriveOverallResult(parsed);
        if (overall) job.overall_result = overall;
        await this.jobDao.save(job);
        this.processed.add(key);
        this.logger.log(
          `OUT file processed for plate ${plate} → job ${job.id} (${overall ?? 'no result'})`,
          OutfileWatcherService.context,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to process OUT file ${fullPath}: ${(err as Error).message}`,
          OutfileWatcherService.context,
        );
      }
    }
  }
}
