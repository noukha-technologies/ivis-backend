import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobIntakeService } from './services/job-intake.service';
import { JobService } from './services/job.service';
import { JobImageService } from './services/job-image.service';
import { InfileGeneratorService } from './services/infile-generator.service';
import { OutfileWatcherService } from './services/outfile-watcher.service';
import { OutfileGeneratorService } from './services/outfile-generator.service';
import { TajdeedEventsModule } from '../transactions/tajdeed-events/tajdeed-events.module';

@Module({
  // Submitting a job queues an inspection result for the appointment provider.
  imports: [TajdeedEventsModule],
  controllers: [JobController],
  providers: [
    JobService,
    JobIntakeService,
    JobImageService,
    InfileGeneratorService,
    OutfileWatcherService,
    OutfileGeneratorService,
  ],
  exports: [JobService],
})
export class JobsModule {}
