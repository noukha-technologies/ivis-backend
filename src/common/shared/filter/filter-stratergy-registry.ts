import { Injectable } from '@nestjs/common';
import { QueryFilter } from './filter.dto';
import { FilterQueryDocument } from './filter-query.type';
import { FilterStrategy } from './filter-stratergy.interface';
import { SearchFilterStrategy } from './search-filter-stratergy';
import { DateFieldFilterStrategy } from './date-field-filter-stratergy';
import { RegexFieldFilterStrategy } from './regex-field-filter-stratergy';
import { LogicalOperatorFilterStrategy } from './logical-filter-stratergy';
import { ArrayFieldFilterStrategy } from './array-field-filter-stratergy';
import { PrimitiveFieldFilterStrategy } from './primitive-field-filter-stratergy';

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
