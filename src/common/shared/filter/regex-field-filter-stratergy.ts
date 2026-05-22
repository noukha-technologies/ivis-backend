import { Injectable } from '@nestjs/common';
import { QueryFilter, RegexFieldFilter } from './filter.dto.js';
import { FilterStrategy } from './filter-stratergy.interface.js';
import { FilterQueryDocument } from './filter-query.type.js';

@Injectable()
export class RegexFieldFilterStrategy implements FilterStrategy<RegexFieldFilter> {
  supports(filter: QueryFilter): boolean {
    return filter.type === 'filter' && filter.filterType === 'RegexField';
  }

  apply(query: FilterQueryDocument, filter: RegexFieldFilter): void {
    const { field, pattern, caseSensitive } = filter;
    if (!field || !pattern) return;

    query[field] = {
      $regex: pattern,
      $options: caseSensitive ? '' : 'i',
    };
  }
}
