import { Injectable } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  ArrayFieldFilter,
  DateFieldFilter,
  FieldFilter,
  LogicalFilter,
  PrimitiveFieldFilter,
  QueryFilter,
  RegexFieldFilter,
  SearchFilter,
} from './filter.dto';

@Injectable()
export class TypeOrmFilterApplier {
  apply<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filters: QueryFilter[] = [],
  ): void {
    for (const filter of filters) {
      this.applyOne(qb, alias, filter);
    }
  }

  private applyOne<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: QueryFilter,
  ): void {
    switch (filter.type) {
      case 'search':
        this.applySearch(qb, alias, filter);
        break;
      case 'filter':
        this.applyField(qb, alias, filter);
        break;
      case 'logicalFilter':
        this.applyLogical(qb, alias, filter);
        break;
    }
  }

  private applySearch<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: SearchFilter,
  ): void {
    if (!filter.term || !filter.fields?.length) return;

    const terms = Array.isArray(filter.term) ? filter.term : [filter.term];

    qb.andWhere(
      new Brackets((sub) => {
        for (const field of filter.fields) {
          for (const term of terms) {
            sub.orWhere(`${alias}.${field} ILIKE :searchTerm`, {
              searchTerm: `%${term}%`,
            });
          }
        }
      }),
    );
  }

  private applyField<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: FieldFilter,
  ): void {
    switch (filter.filterType) {
      case 'PrimitiveField':
        this.applyPrimitive(qb, alias, filter as PrimitiveFieldFilter);
        break;
      case 'DateField':
        this.applyDate(qb, alias, filter as DateFieldFilter);
        break;
      case 'RegexField':
        this.applyRegex(qb, alias, filter as RegexFieldFilter);
        break;
      case 'ArrayField':
        this.applyArray(qb, alias, filter as ArrayFieldFilter);
        break;
    }
  }

  private applyPrimitive<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: PrimitiveFieldFilter,
  ): void {
    const param = `pf_${filter.field}`;
    if (filter.operator === 'EQUALS') {
      qb.andWhere(`${alias}.${filter.field} = :${param}`, { [param]: filter.value });
    } else {
      qb.andWhere(`${alias}.${filter.field} != :${param}`, { [param]: filter.value });
    }
  }

  private applyDate<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: DateFieldFilter,
  ): void {
    if (filter.from) {
      qb.andWhere(`${alias}.${filter.field} >= :${filter.field}_from`, {
        [`${filter.field}_from`]: new Date(filter.from),
      });
    }
    if (filter.to) {
      qb.andWhere(`${alias}.${filter.field} <= :${filter.field}_to`, {
        [`${filter.field}_to`]: new Date(filter.to),
      });
    }
  }

  private applyRegex<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: RegexFieldFilter,
  ): void {
    const param = `rx_${filter.field}`;
    if (filter.caseSensitive) {
      qb.andWhere(`${alias}.${filter.field} ~ :${param}`, { [param]: filter.pattern });
    } else {
      qb.andWhere(`${alias}.${filter.field} ~* :${param}`, { [param]: filter.pattern });
    }
  }

  private applyArray<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: ArrayFieldFilter,
  ): void {
    const param = `arr_${filter.field}`;
    if (filter.operator === 'ANY') {
      qb.andWhere(`${alias}.${filter.field} IN (:...${param})`, { [param]: filter.values });
    } else {
      qb.andWhere(`${alias}.${filter.field} NOT IN (:...${param})`, { [param]: filter.values });
    }
  }

  private applyLogical<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    alias: string,
    filter: LogicalFilter,
  ): void {
    if (!filter.conditions?.length) return;

    const method =
      filter.operator === '$or' ? 'orWhere' : filter.operator === '$nor' ? 'andWhere' : 'andWhere';

    qb.andWhere(
      new Brackets((outer) => {
        for (const condition of filter.conditions) {
          outer[method](
            new Brackets((inner) => {
              for (const [field, value] of Object.entries(condition)) {
                const param = `lf_${field}_${Math.random().toString(36).slice(2, 8)}`;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                  const ops = value as Record<string, unknown>;
                  if ('$gte' in ops) {
                    inner.andWhere(`${alias}.${field} >= :${param}_gte`, {
                      [`${param}_gte`]: ops.$gte,
                    });
                  }
                  if ('$lte' in ops) {
                    inner.andWhere(`${alias}.${field} <= :${param}_lte`, {
                      [`${param}_lte`]: ops.$lte,
                    });
                  }
                  if ('$in' in ops && Array.isArray(ops.$in)) {
                    inner.andWhere(`${alias}.${field} IN (:...${param}_in)`, {
                      [`${param}_in`]: ops.$in,
                    });
                  }
                } else {
                  inner.andWhere(`${alias}.${field} = :${param}`, { [param]: value });
                }
              }
            }),
          );
        }
      }),
    );
  }
}
