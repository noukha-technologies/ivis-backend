export type QueryFilter = SearchFilter | FieldFilter | LogicalFilter;

export interface SearchFilter {
  type: 'search';
  fields: string[];
  term: string | string[];
}

export interface FieldFilter {
  type: 'filter';
  filterType: 'DateField' | 'RegexField' | 'ArrayField' | 'PrimitiveField';
  field: string;
}

export interface LogicalFilter {
  type: 'logicalFilter';
  operator: string;
  conditions: Record<string, unknown>[];
}

export interface DateFieldFilter extends FieldFilter {
  filterType: 'DateField';
  from?: string;
  to?: string;
}

export interface RegexFieldFilter extends FieldFilter {
  filterType: 'RegexField';
  pattern: string;
  caseSensitive?: boolean;
}

export interface ArrayFieldFilter extends FieldFilter {
  filterType: 'ArrayField';
  values: (number | string)[];
  operator: 'ANY' | 'NONE';
}

export interface PrimitiveFieldFilter extends FieldFilter {
  filterType: 'PrimitiveField';
  value: number | boolean | string | Date;
  operator: 'EQUALS' | 'NOT-EQUALS';
}
