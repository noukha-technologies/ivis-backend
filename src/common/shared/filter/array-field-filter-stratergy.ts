import { Injectable } from '@nestjs/common';
import { FilterStrategy } from './filter-stratergy.interface';
import { ArrayFieldFilter, QueryFilter } from './filter.dto';
import { FilterQueryDocument } from './filter-query.type';

@Injectable()
export class ArrayFieldFilterStrategy implements FilterStrategy<ArrayFieldFilter> {
  supports(filter: QueryFilter): boolean {
    return filter.type === 'filter' && filter.filterType === 'ArrayField';
  }

  apply(query: FilterQueryDocument, filter: ArrayFieldFilter): void {
    const { field, operator, values } = filter;
    if (!field || !Array.isArray(values) || values.length === 0) return;

    query[field] = {
      [operator === 'ANY' ? '$in' : '$nin']: values,
    };
  }
}
