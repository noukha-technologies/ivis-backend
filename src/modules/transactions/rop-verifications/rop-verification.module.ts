import { Module } from '@nestjs/common';
import { RopVerificationController } from './rop-verification.controller';
import { RopVerificationService } from './services/rop-verification.service';

@Module({
  controllers: [RopVerificationController],
  providers: [RopVerificationService],
  exports: [RopVerificationService],
})
export class RopVerificationModule {}

