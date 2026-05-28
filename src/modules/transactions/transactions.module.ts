import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnprCaptureModule } from './anpr-captures/anpr-capture.module';
import { RopVerificationModule } from './rop-verifications/rop-verification.module';

@Module({
    imports: [DatabaseModule, AnprCaptureModule, RopVerificationModule],
    exports: [AnprCaptureModule, RopVerificationModule],
})
export class TransactionsModule { }
