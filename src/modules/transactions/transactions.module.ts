import { Module } from '@nestjs/common';
import { PaymentsModule } from './payments/payments.module';
import { DatabaseModule } from '../database/database.module';
import { CustomerModule } from './customers/customer.module';
import { AnprCaptureModule } from './anpr-captures/anpr-capture.module';
import { RopVerificationModule } from './rop-verifications/rop-verification.module';
@Module({
  imports: [
    DatabaseModule,
    AnprCaptureModule,
    RopVerificationModule,
    CustomerModule,
    PaymentsModule,
  ],
  exports: [
    AnprCaptureModule,
    RopVerificationModule,
    CustomerModule,
    PaymentsModule,
  ],
})
export class TransactionsModule {}
