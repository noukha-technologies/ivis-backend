import { Module } from '@nestjs/common';
import { PaginationModule } from '../../../common/shared/pagination/pagination.module';
import { ChargeCategoryController } from './charge-category.controller';
import { ChargeCategoryService } from './service/charge-category.service';

@Module({
  imports: [PaginationModule],
  controllers: [ChargeCategoryController],
  providers: [ChargeCategoryService],
  exports: [ChargeCategoryService],
})
export class ChargeCategoryModule {}
