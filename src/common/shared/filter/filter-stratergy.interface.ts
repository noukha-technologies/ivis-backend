import { QueryFilter } from './filter.dto';
import { FilterQueryDocument } from './filter-query.type';

export interface FilterStrategy<T = QueryFilter> {
  supports(filter: QueryFilter): boolean;
  apply(query: FilterQueryDocument, filter: T): void;
}
