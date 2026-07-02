import { Module } from '@nestjs/common';
import { AnprCaptureController } from './anpr-capture.controller';
import { AnprCaptureService } from './services/anpr-capture.service';
import { AnprOrchestrationService } from './services/anpr-orchestration.service';
import { CaptureValidationService } from './services/capture-validation.service';
import { ImageProcessorService } from '../../../common/shared/anpr/image-processor.service';

@Module({
  imports: [],
  controllers: [AnprCaptureController],
  providers: [
    AnprCaptureService,
    AnprOrchestrationService,
    CaptureValidationService,
    ImageProcessorService,
  ],
  exports: [AnprCaptureService, CaptureValidationService],
})
export class AnprCaptureModule {}

