import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppLogger } from '../../../common/logger/app.logger';
import {
  deriveOverallResult,
  parseIni,
} from '../../../common/shared/files/ini-parser.util';
import {
  normalizePlateForFileName,
  parseOutFileName,
} from '../../../common/shared/files/inspection-file-name.util';
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
      const adminPcs = await this.adminPcDao.find({
        where: { is_deleted: false },
      });
      for (const pc of adminPcs) {
        const dir = pc.out_file_path?.trim();
        if (dir) await this.scanFolder(dir);
      }
    } catch (err) {
      this.logger.warn(
        `OUT watcher cycle failed: ${(err as Error).message}`,
        OutfileWatcherService.context,
      );
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

        // <PLATE>-outfile-<YYYYMMDD>.res.txt is the agreed convention, and the
        // name is checked against the file's own LicenceNo when it follows it.
        // A mismatch means the file was renamed or copied over another and its
        // result would be attributed to the wrong vehicle, so it is refused.
        //
        // A non-conforming name is NOT refused: the rig writes these files and
        // does not always follow the convention (the vendor's own samples do
        // not), and discarding a real inspection result over a filename would
        // lose work that cannot be recovered. It is logged instead.
        const named = parseOutFileName(file);
        if (named) {
          if (named.plate !== normalizePlateForFileName(plate)) {
            this.logger.warn(
              `OUT file ${file} is named for plate ${named.plate} but contains ${plate} — skipped, resolve the mismatch before it is attributed`,
              OutfileWatcherService.context,
            );
            this.processed.add(key);
            continue;
          }
        } else {
          this.logger.log(
            `OUT file ${file} does not follow <PLATE>-outfile-<YYYYMMDD>.res.txt — processed on its LicenceNo (${plate})`,
            OutfileWatcherService.context,
          );
        }

        const candidates = await this.jobDao
          .createQueryBuilder('job')
          .leftJoinAndSelect('job.vehicleRecord', 'vr')
          .where('job.is_deleted = false')
          .andWhere('job.status = :status', { status: 'In Progress' })
          .andWhere('vr.plate_number = :plate', { plate })
          .orderBy('job.created_at', 'DESC')
          .getMany();

        if (candidates.length === 0) continue; // not started yet — retry next cycle

        // Two in-progress jobs for one plate cannot be told apart by plate, and
        // guessing the newest would attach the result to the wrong inspection.
        // That is survivable while the mistake stays local, but this result is
        // also pushed to the provider, where it completes a booking and cannot
        // be withdrawn — so an ambiguous file is left for an operator instead.
        if (candidates.length > 1) {
          this.logger.warn(
            `OUT file ${file} matches ${candidates.length} in-progress jobs for plate ${plate} (${candidates.map((j) => `#J${j.job_id}`).join(', ')}) — skipped, resolve the duplicate before it can be attributed`,
            OutfileWatcherService.context,
          );
          this.processed.add(key);
          continue;
        }

        const job = candidates[0];

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
