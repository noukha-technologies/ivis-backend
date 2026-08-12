import { Module } from '@nestjs/common';
import { PaymentsModule } from './payments/payments.module';
import { DatabaseModule } from '../database/database.module';
import { CustomerModule } from './customers/customer.module';
import { AnprCaptureModule } from './anpr-captures/anpr-capture.module';
import { RopVerificationModule } from './rop-verifications/rop-verification.module';
import { OnlineAppointmentModule } from './online-appointments/online-appointment.module';
@Module({
  imports: [
    DatabaseModule,
    AnprCaptureModule,
    RopVerificationModule,
    CustomerModule,
    PaymentsModule,
    OnlineAppointmentModule,
  ],
  exports: [
    AnprCaptureModule,
    RopVerificationModule,
    CustomerModule,
    PaymentsModule,
    OnlineAppointmentModule,
  ],
})
export class TransactionsModule {}
