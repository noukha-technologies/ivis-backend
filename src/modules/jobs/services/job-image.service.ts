import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { randomBytes } from 'crypto';
import { AppLogger } from '../../../common/logger/app.logger';
import { getUploadRoot } from '../../../common/utils/file-storage.util';
import { ResourceNotFoundException } from '../../../common/exceptions/custom.exception';
import { JobDao } from '../../database/dao/job.dao';
import { JobImageDao } from '../../database/dao/job-image.dao';
import {
  JobImage,
  JobImageSource,
} from '../../database/entity/job-image.entity';

const JOB_IMAGES_SUBDIR = 'job-images';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class JobImageService {
  private static readonly context = 'JobImageService';

  constructor(
    private readonly jobDao: JobDao,
    private readonly jobImageDao: JobImageDao,
    private readonly logger: AppLogger,
  ) {}

  async listForJob(jobId: string): Promise<JobImage[]> {
    return this.jobImageDao.findByJobId(jobId);
  }

  /** Compress to JPEG quality 50 — same "reduced to 50%" rule already applied to ANPR images. */
  private async compressToJpeg50(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer).jpeg({ quality: 50 }).toBuffer();
  }

  async addImage(
    jobId: string,
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    source: JobImageSource,
    createdBy?: string,
  ): Promise<JobImage> {
    const job = await this.jobDao.findActiveById(jobId);
    if (!job) {
      throw new ResourceNotFoundException('Job', jobId);
    }

    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No image file was provided.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image exceeds the 10MB size limit.');
    }

    let compressed: Buffer;
    try {
      compressed = await this.compressToJpeg50(file.buffer);
    } catch (error) {
      this.logger.error(
        `Failed to process job image for job ${jobId}: ${(error as Error).message}`,
        (error as Error).stack,
        JobImageService.context,
      );
      throw new BadRequestException('Uploaded file is not a valid image.');
    }

    const uploadDir = path.join(getUploadRoot(), JOB_IMAGES_SUBDIR);
    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `${job.job_id}_${Date.now()}_${randomBytes(4).toString('hex')}.jpg`;
    await fs.writeFile(path.join(uploadDir, filename), compressed);

    const image = this.jobImageDao.create({
      job_id: jobId,
      image_url: `/uploads/${JOB_IMAGES_SUBDIR}/${filename}`,
      source,
      created_by: createdBy,
    });
    const saved = await this.jobImageDao.save(image);
    this.logger.log(
      `Job image saved for job ${jobId} (source: ${source})`,
      JobImageService.context,
    );
    return saved;
  }

  async removeImage(jobId: string, imageId: string): Promise<void> {
    const image = await this.jobImageDao.findActiveById(imageId);
    if (!image || image.job_id !== jobId) {
      throw new ResourceNotFoundException('JobImage', imageId);
    }
    await this.jobImageDao.softDeleteById(imageId);
  }
}
