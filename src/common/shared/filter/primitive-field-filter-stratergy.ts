import { Injectable } from '@nestjs/common';
import { PrimitiveFieldFilter, QueryFilter } from './filter.dto';
import { FilterQueryDocument } from './filter-query.type';
import { FilterStrategy } from './filter-stratergy.interface';

@Injectable()
export class PrimitiveFieldFilterStrategy implements FilterStrategy<PrimitiveFieldFilter> {
  supports(filter: QueryFilter): boolean {
    return filter.type === 'filter' && filter.filterType === 'PrimitiveField';
  }

  apply(query: FilterQueryDocument, filter: PrimitiveFieldFilter): void {
    const { field, operator, value } = filter;
    if (!field) return;
    query[field] = operator === 'EQUALS' ? value : { $ne: value };
  }
}
