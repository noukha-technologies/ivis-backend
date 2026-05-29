import { Module } from '@nestjs/common';
import { TransactionsSharedModule } from '../transactions/shared/transactions-shared.module';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './services/appointment.service';

@Module({
  imports: [TransactionsSharedModule],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentsModule {}
