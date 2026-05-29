import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module';
import { PaymentTransactionController } from './payment-transaction.controller';
import { PaymentTransactionService } from './services/payment-transaction.service';

@Module({
  imports: [JobsModule],
  controllers: [PaymentTransactionController],
  providers: [PaymentTransactionService],
  exports: [PaymentTransactionService],
})
export class PaymentTransactionModule {}
