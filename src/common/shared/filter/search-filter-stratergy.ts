import { Injectable } from '@nestjs/common';
import { FilterStrategy } from './filter-stratergy.interface.js';
import { QueryFilter, SearchFilter } from './filter.dto.js';
import { FilterQueryDocument } from './filter-query.type.js';

@Injectable()
export class SearchFilterStrategy implements FilterStrategy<SearchFilter> {
  private escapeRegex(term: string): string {
    return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  supports(filter: QueryFilter): boolean {
    return filter.type === 'search';
  }

  apply(query: FilterQueryDocument, filter: SearchFilter): void {
    if (!filter.term) return;

    const terms = Array.isArray(filter.term) ? filter.term : [filter.term];

    query.$or = filter.fields.map((field) => ({
      [field]: {
        $in: terms.map((t) => new RegExp(this.escapeRegex(t), 'i')),
      },
    }));
  }
}
