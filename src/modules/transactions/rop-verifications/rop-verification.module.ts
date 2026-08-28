import { Module } from '@nestjs/common';
import { RopVerificationController } from './rop-verification.controller';
import { RopVerificationService } from './services/rop-verification.service';
import { RopRetrySweepService } from './services/rop-retry-sweep.service';
import { AnprCaptureModule } from '../anpr-captures/anpr-capture.module';

@Module({
  imports: [AnprCaptureModule],
  controllers: [RopVerificationController],
  providers: [RopVerificationService, RopRetrySweepService],
  exports: [RopVerificationService],
})
export class RopVerificationModule {}
