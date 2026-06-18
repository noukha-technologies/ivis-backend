import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobIntakeService } from './services/job-intake.service';
import { JobService } from './services/job.service';

@Module({
  controllers: [JobController],
  providers: [JobService, JobIntakeService],
  exports: [JobService],
})
export class JobsModule {}
