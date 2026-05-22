import { QueryFilter } from './filter.dto.js';
import { FilterQueryDocument } from './filter-query.type.js';

export interface FilterStrategy<T = QueryFilter> {
  supports(filter: QueryFilter): boolean;
  apply(query: FilterQueryDocument, filter: T): void;
}
