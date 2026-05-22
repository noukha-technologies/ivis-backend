import { Injectable } from '@nestjs/common';
import { QueryFilter } from './filter.dto.js';
import { FilterQueryDocument } from './filter-query.type.js';
import { FilterStrategy } from './filter-stratergy.interface.js';
import { SearchFilterStrategy } from './search-filter-stratergy.js';
import { DateFieldFilterStrategy } from './date-field-filter-stratergy.js';
import { RegexFieldFilterStrategy } from './regex-field-filter-stratergy.js';
import { LogicalOperatorFilterStrategy } from './logical-filter-stratergy.js';
import { ArrayFieldFilterStrategy } from './array-field-filter-stratergy.js';
import { PrimitiveFieldFilterStrategy } from './primitive-field-filter-stratergy.js';

@Injectable()
export class FilterStrategyRegistry {
  private readonly strategies: FilterStrategy[];

  constructor(
    search: SearchFilterStrategy,
    regex: RegexFieldFilterStrategy,
    date: DateFieldFilterStrategy,
    logical: LogicalOperatorFilterStrategy,
    array: ArrayFieldFilterStrategy,
    primitive: PrimitiveFieldFilterStrategy,
  ) {
    this.strategies = [search, regex, date, logical, array, primitive];
  }

  applyAll(query: FilterQueryDocument, filters: QueryFilter[]): void {
    for (const filter of filters) {
      const strategy = this.strategies.find((s) => s.supports(filter));
      strategy?.apply(query, filter);
    }
  }

  build(filters: QueryFilter[] = []): FilterQueryDocument {
    const query: FilterQueryDocument = {};
    this.applyAll(query, filters);
    return query;
  }
}
