import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobService } from './services/job.service';

@Module({
  controllers: [JobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobsModule {}
