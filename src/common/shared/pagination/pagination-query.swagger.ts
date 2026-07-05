/** Shared Swagger query params for paginated list endpoints. */
export const PAGINATION_API_QUERIES = [
  {
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1)',
  },
  {
    name: 'limit',
    required: false,
    type: Number,
    description: 'Records per page (default 10)',
  },
  {
    name: 'search',
    required: false,
    type: String,
    description: 'Search across resource text fields',
  },
  {
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Column to sort by',
  },
  {
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort direction (default DESC)',
  },
  {
    name: 'filters',
    required: false,
    type: String,
    description:
      'JSON array of QueryFilter objects (PrimitiveField, DateField, etc.)',
  },
  {
    name: 'nonPaginated',
    required: false,
    type: Boolean,
    description: 'Return all rows without paging',
  },
] as const;
