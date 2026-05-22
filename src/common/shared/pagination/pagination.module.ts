import { Global, Module } from '@nestjs/common';
import { FilterStrategyRegistry } from '../filter/filter-stratergy-registry.js';
import { SearchFilterStrategy } from '../filter/search-filter-stratergy.js';
import { DateFieldFilterStrategy } from '../filter/date-field-filter-stratergy.js';
import { RegexFieldFilterStrategy } from '../filter/regex-field-filter-stratergy.js';
import { LogicalOperatorFilterStrategy } from '../filter/logical-filter-stratergy.js';
import { ArrayFieldFilterStrategy } from '../filter/array-field-filter-stratergy.js';
import { PrimitiveFieldFilterStrategy } from '../filter/primitive-field-filter-stratergy.js';
import { TypeOrmFilterApplier } from '../filter/typeorm-filter.applier.js';
import { PaginationService } from './pagination.service.js';
import { TypeOrmPaginationService } from './typeorm-pagination.service.js';

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
  exports: [TypeOrmPaginationService, PaginationService],
})
export class PaginationModule { }
