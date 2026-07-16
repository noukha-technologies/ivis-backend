import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobIntakeService } from './services/job-intake.service';
import { JobService } from './services/job.service';
import { JobImageService } from './services/job-image.service';
import { InfileGeneratorService } from './services/infile-generator.service';
import { OutfileWatcherService } from './services/outfile-watcher.service';

@Module({
  controllers: [JobController],
  providers: [
    JobService,
    JobIntakeService,
    JobImageService,
    InfileGeneratorService,
    OutfileWatcherService,
  ],
  exports: [JobService],
})
export class JobsModule {}
