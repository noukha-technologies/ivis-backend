import { FilterQueryDocument } from '../shared/filter/filter-query.type';
import { QueryFilter } from '../shared/filter/filter.dto';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export type PaginationResponse<K> = {
  totalItems: number;
  totalPages: number;
  skip: number;
  limit: number;
  items: K[];
};

export type PaginationOptions<T, K> = {
  filter?: QueryFilter[];
  skip?: number;
  limit?: number;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  nonPaginated?: boolean;
  mapper?: (item: T) => K;
  pipeline?: Record<string, unknown>[];
};

/** MongoDB collection shape (legacy). */
export type PageableCollection<T = unknown> = {
  find: (
    query: FilterQueryDocument,
    projection: Record<string, 0 | 1>,
    options: Record<string, unknown>,
  ) => Promise<T[]>;
  countDocuments: (query: FilterQueryDocument) => Promise<number>;
  aggregate: (
    pipeline: Record<string, unknown>[],
  ) => Promise<AggregateFacetResult[]>;
};

type AggregateFacetResult = {
  items?: unknown[];
  totalCount?: { count: number }[];
};
