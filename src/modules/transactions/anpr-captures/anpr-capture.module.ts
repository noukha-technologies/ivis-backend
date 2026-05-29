import { Module } from '@nestjs/common';
import { TransactionsSharedModule } from '../shared/transactions-shared.module';
import { AnprCaptureController } from './anpr-capture.controller';
import { AnprCaptureService } from './services/anpr-capture.service';

@Module({
  imports: [TransactionsSharedModule],
  controllers: [AnprCaptureController],
  providers: [AnprCaptureService],
  exports: [AnprCaptureService],
})
export class AnprCaptureModule {}

