import { Module } from '@nestjs/common';
import { AnprCaptureController } from './anpr-capture.controller';
import { AnprCaptureService } from './services/anpr-capture.service';
import { AnprOrchestrationService } from './services/anpr-orchestration.service';

@Module({
  imports: [],
  controllers: [AnprCaptureController],
  providers: [AnprCaptureService, AnprOrchestrationService],
  exports: [AnprCaptureService],
})
export class AnprCaptureModule {}

