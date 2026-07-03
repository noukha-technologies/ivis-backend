import { BadRequestException } from '@nestjs/common';
import { PaginationQueryDto, SortOrder } from '../../dto/pagination.dto';
import {
  PaginatedResult,
  PaginationResponse,
} from '../../interfaces/pagination.interface';
import { QueryFilter } from '../filter/filter.dto';
import { TypeOrmPaginationOptions } from './typeorm-pagination.service';
import { RelationJoin } from './relation-join.util';

export type EntityPaginationConfig = {
  searchFields?: string[];
  defaultSort?: Record<string, 'ASC' | 'DESC'>;
  allowedSortFields?: string[];
  baseWhere?: Record<string, unknown>;
  /** Relations to join declaratively (applied by the paginator before filter/sort). */
  joinRelations?: RelationJoin[];
};

export function parseQueryFilters(
  query: PaginationQueryDto,
  searchFields: string[] = [],
): QueryFilter[] {
  const filters: QueryFilter[] = [];

  if (query.search?.trim() && searchFields.length > 0) {
    filters.push({
      type: 'search',
      fields: searchFields,
      term: query.search.trim(),
    });
  }

  if (query.filters?.trim()) {
    try {
      const parsed: unknown = JSON.parse(query.filters);
      if (!Array.isArray(parsed)) {
        throw new BadRequestException(
          'filters must be a JSON array of QueryFilter objects',
        );
      }
      filters.push(...(parsed as QueryFilter[]));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('filters must be valid JSON');
    }
  }

  return filters;
}

export function parseSort(
  query: PaginationQueryDto,
  config: EntityPaginationConfig,
): Record<string, 'ASC' | 'DESC'> {
  const defaultSort = config.defaultSort ?? { created_at: 'DESC' };
  const sortBy = query.sortBy?.trim();

  if (!sortBy) {
    return defaultSort;
  }

  if (config.allowedSortFields && !config.allowedSortFields.includes(sortBy)) {
    throw new BadRequestException(
      `Invalid sortBy '${sortBy}'. Allowed: ${config.allowedSortFields.join(', ')}`,
    );
  }

  const direction: 'ASC' | 'DESC' =
    query.sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';

  return { [sortBy]: direction };
}

export function buildTypeOrmPaginationOptions<Entity, K>(
  query: PaginationQueryDto,
  config: EntityPaginationConfig,
): TypeOrmPaginationOptions<Entity, K> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const skip = (page - 1) * limit;

  return {
    filter: parseQueryFilters(query, config.searchFields ?? []),
    skip,
    limit,
    sort: parseSort(query, config),
    nonPaginated: query.nonPaginated,
    baseWhere: config.baseWhere,
    joinRelations: config.joinRelations,
  };
}

export function toPaginatedResult<T>(
  response: PaginationResponse<T>,
): PaginatedResult<T> {
  const page =
    response.limit > 0 ? Math.floor(response.skip / response.limit) + 1 : 1;

  return {
    data: response.items,
    meta: {
      total: response.totalItems,
      page,
      limit: response.limit,
      totalPages: response.totalPages,
      hasNextPage: page < response.totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
