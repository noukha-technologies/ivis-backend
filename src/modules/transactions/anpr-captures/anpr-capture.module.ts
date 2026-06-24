import { Module } from '@nestjs/common';
import { AnprCaptureController } from './anpr-capture.controller';
import { AnprCaptureService } from './services/anpr-capture.service';

@Module({
  imports: [],
  controllers: [AnprCaptureController],
  providers: [AnprCaptureService],
  exports: [AnprCaptureService],
})
export class AnprCaptureModule {}

