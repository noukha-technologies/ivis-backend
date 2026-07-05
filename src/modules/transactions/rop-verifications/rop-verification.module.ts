import { Module } from '@nestjs/common';
import { RopVerificationController } from './rop-verification.controller';
import { RopVerificationService } from './services/rop-verification.service';
import { AnprCaptureModule } from '../anpr-captures/anpr-capture.module';

@Module({
  imports: [AnprCaptureModule],
  controllers: [RopVerificationController],
  providers: [RopVerificationService],
  exports: [RopVerificationService],
})
export class RopVerificationModule {}
