import { Injectable } from '@nestjs/common';
import { DateFieldFilter, FieldFilter } from './filter.dto';
import { FilterQueryDocument } from './filter-query.type';
import { FilterStrategy } from './filter-stratergy.interface';

@Injectable()
export class DateFieldFilterStrategy implements FilterStrategy<DateFieldFilter> {
  supports(filter: FieldFilter): boolean {
    return filter.type === 'filter' && filter.filterType === 'DateField';
  }

  apply(query: FilterQueryDocument, filter: DateFieldFilter): void {
    const { field, from, to } = filter;
    if (!from && !to) return;

    const fromDate = from ? this.parseUtcDate(from, true) : null;
    const toDate = to ? this.parseUtcDate(to, false) : fromDate;

    if (
      (fromDate && isNaN(fromDate.getTime())) ||
      (toDate && isNaN(toDate.getTime()))
    ) {
      return;
    }

    query[field] = {
      ...(fromDate && { $gte: fromDate }),
      ...(toDate && { $lte: toDate }),
    };
  }

  private parseUtcDate(value: string, isStart: boolean): Date {
    if (value.includes('T')) {
      return new Date(value);
    }
    return isStart
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(`${value}T23:59:59.999Z`);
  }
}
