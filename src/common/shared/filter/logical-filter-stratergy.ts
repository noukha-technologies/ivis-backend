import { Injectable } from '@nestjs/common';
import { FilterStrategy } from './filter-stratergy.interface';
import { LogicalFilter, QueryFilter } from './filter.dto';
import { FilterQueryDocument } from './filter-query.type';

export const MongoLogicalOperators = ['$or', '$and', '$nor'] as const;

@Injectable()
export class LogicalOperatorFilterStrategy implements FilterStrategy<LogicalFilter> {
  private readonly allowedLogicalOperators = new Set<string>(
    MongoLogicalOperators,
  );

  private readonly allowedFieldOperators = new Set([
    '$eq',
    '$ne',
    '$gt',
    '$gte',
    '$lt',
    '$lte',
    '$in',
    '$nin',
    '$exists',
    '$regex',
    '$not',
  ]);

  supports(filter: QueryFilter): boolean {
    return filter.type === 'logicalFilter';
  }

  apply(query: FilterQueryDocument, filter: LogicalFilter): void {
    const { operator, conditions } = filter;

    if (
      !this.allowedLogicalOperators.has(operator) ||
      !Array.isArray(conditions) ||
      !conditions.length
    ) {
      return;
    }

    for (const condition of conditions) {
      if (!this.isSafeCondition(condition)) {
        return;
      }
    }

    query[operator] = conditions;
  }

  private isSafeCondition(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.every((v) => this.isSafeCondition(v));
    }

    if (value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        if (key.startsWith('$') && !this.allowedFieldOperators.has(key)) {
          return false;
        }
        if (!this.isSafeCondition(val)) {
          return false;
        }
      }
    }

    return true;
  }
}
