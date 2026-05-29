import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnprCaptureModule } from './anpr-captures/anpr-capture.module';
import { RopVerificationModule } from './rop-verifications/rop-verification.module';
import { CustomerModule } from './customers/customer.module';
import { PaymentTransactionModule } from './payment-transactions/payment-transaction.module';
import { TransactionsSharedModule } from './shared/transactions-shared.module';

@Module({
    imports: [
        DatabaseModule,
        TransactionsSharedModule,
        AnprCaptureModule,
        RopVerificationModule,
        CustomerModule,
        PaymentTransactionModule,
    ],
    exports: [
        AnprCaptureModule,
        RopVerificationModule,
        CustomerModule,
        PaymentTransactionModule,
        TransactionsSharedModule,
    ],
})
export class TransactionsModule { }
