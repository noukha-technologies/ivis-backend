import { Global, Module } from '@nestjs/common';
import { FilterStrategyRegistry } from '../filter/filter-stratergy-registry';
import { SearchFilterStrategy } from '../filter/search-filter-stratergy';
import { DateFieldFilterStrategy } from '../filter/date-field-filter-stratergy';
import { RegexFieldFilterStrategy } from '../filter/regex-field-filter-stratergy';
import { LogicalOperatorFilterStrategy } from '../filter/logical-filter-stratergy';
import { ArrayFieldFilterStrategy } from '../filter/array-field-filter-stratergy';
import { PrimitiveFieldFilterStrategy } from '../filter/primitive-field-filter-stratergy';
import { TypeOrmFilterApplier } from '../filter/typeorm-filter.applier';
import { PaginationService } from './pagination.service';
import { TypeOrmPaginationService } from './typeorm-pagination.service';

@Global()
@Module({
  providers: [
    SearchFilterStrategy,
    LogicalOperatorFilterStrategy,
    DateFieldFilterStrategy,
    RegexFieldFilterStrategy,
    ArrayFieldFilterStrategy,
    PrimitiveFieldFilterStrategy,
    FilterStrategyRegistry,
    TypeOrmFilterApplier,
    PaginationService,
    TypeOrmPaginationService,
  ],
  exports: [TypeOrmPaginationService, PaginationService, TypeOrmFilterApplier],
})
export class PaginationModule {}
