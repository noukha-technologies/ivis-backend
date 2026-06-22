import { Module } from '@nestjs/common';
import { PaginationModule } from '../../../common/shared/pagination/pagination.module';
import { PaymentTypeController } from './payment-type.controller';
import { PaymentTypeService } from './service/payment-type.service';

@Module({
  imports: [PaginationModule],
  controllers: [PaymentTypeController],
  providers: [PaymentTypeService],
  exports: [PaymentTypeService],
})
export class PaymentTypeModule {}
