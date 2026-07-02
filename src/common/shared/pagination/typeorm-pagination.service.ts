import { Injectable } from '@nestjs/common';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { QueryFilter } from '../filter/filter.dto';
import { TypeOrmFilterApplier } from '../filter/typeorm-filter.applier';
import { PaginationResponse } from '../../interfaces/pagination.interface';
import { RelationJoin, applyRelationJoins } from './relation-join.util';

export type TypeOrmPaginationOptions<T, K> = {
  filter?: QueryFilter[];
  skip?: number;
  limit?: number;
  sort?: Record<string, 'ASC' | 'DESC'>;
  nonPaginated?: boolean;
  mapper?: (item: T) => K;
  /** Extra WHERE, e.g. { is_deleted: false } */
  baseWhere?: Record<string, unknown>;
  /** Relations to left/inner join (declaratively) before filter/sort run. */
  joinRelations?: RelationJoin[];
};

@Injectable()
export class TypeOrmPaginationService {
  constructor(private readonly filterApplier: TypeOrmFilterApplier) { }

  async paginate<Entity extends ObjectLiteral, K>(
    repository: Repository<Entity>,
    alias: string,
    options: TypeOrmPaginationOptions<Entity, K> = {},
  ): Promise<PaginationResponse<K>> {
    const qb = repository.createQueryBuilder(alias);
    return this.paginateQueryBuilder(qb, alias, options);
  }

  async paginateQueryBuilder<Entity extends ObjectLiteral, K>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    options: TypeOrmPaginationOptions<Entity, K> = {},
  ): Promise<PaginationResponse<K>> {
    const {
      filter = [],
      skip = 0,
      limit = 10,
      sort = { id: 'DESC' } as Record<string, 'ASC' | 'DESC'>,
      nonPaginated,
      mapper,
      baseWhere = {},
      joinRelations,
    } = options;

    // Apply declarative relation joins first so filter/sort can reference them.
    applyRelationJoins(qb, joinRelations);

    for (const [key, value] of Object.entries(baseWhere)) {
      qb.andWhere(`${alias}.${key} = :base_${key}`, { [`base_${key}`]: value });
    }

    this.filterApplier.apply(qb, alias, filter);

    for (const [field, direction] of Object.entries(sort)) {
      // A dotted field already carries its (joined) alias, e.g. 'centre.name'.
      const column = field.includes('.') ? field : `${alias}.${field}`;
      qb.addOrderBy(column, direction);
    }

    if (nonPaginated) {
      const items = await qb.getMany();
      return {
        totalItems: items.length,
        totalPages: 1,
        skip: 0,
        limit: items.length,
        items: mapper ? items.map(mapper) : (items as unknown as K[]),
      };
    }

    const [items, totalItems] = await Promise.all([
      qb.clone().skip(skip).take(limit).getMany(),
      qb.clone().getCount(),
    ]);

    return {
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
      skip,
      limit,
      items: mapper ? items.map(mapper) : (items as unknown as K[]),
    };
  }
}
