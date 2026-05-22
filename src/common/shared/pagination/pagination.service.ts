import { Injectable } from '@nestjs/common';
import { FilterStrategyRegistry } from '../filter/filter-stratergy-registry.js';
import { PageableCollection, PaginationOptions, PaginationResponse } from '../../interfaces/pagination.interface.js';

@Injectable()
export class PaginationService {
  constructor(private readonly registry: FilterStrategyRegistry) { }

  async findAndPaginate<T, K>(
    collection: PageableCollection<T>,
    options: PaginationOptions<T, K> = {},
  ): Promise<PaginationResponse<K>> {
    const {
      filter = [],
      skip = 0,
      limit = 10,
      projection = {},
      sort = { _id: -1 },
      nonPaginated,
      pipeline,
      mapper,
    } = options;

    const query = this.registry.build(filter);

    if (pipeline && pipeline.length > 0) {
      const basePipeline: Record<string, unknown>[] = [...pipeline];

      if (Object.keys(query).length) {
        basePipeline.push({ $match: query });
      }
      if (Object.keys(projection).length > 0) {
        basePipeline.push({ $project: projection });
      }

      if (nonPaginated) {
        const items = (await collection.aggregate([
          ...basePipeline,
          { $sort: sort },
        ])) as T[];

        return {
          totalItems: items.length,
          totalPages: 1,
          skip: 0,
          limit: items.length,
          items: mapper ? items.map(mapper) : (items as unknown as K[]),
        };
      }

      const result = await collection.aggregate([
        ...basePipeline,
        {
          $facet: {
            items: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
            totalCount: [{ $count: 'count' }],
          },
        },
      ]);

      const items = (result[0]?.items ?? []) as T[];
      const totalItems = result[0]?.totalCount?.[0]?.count ?? 0;

      return {
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
        skip,
        limit,
        items: mapper ? items.map(mapper) : (items as unknown as K[]),
      };
    }

    if (nonPaginated) {
      const items = (await collection.find(query, projection, {
        lean: true,
        sort,
      })) as T[];

      return {
        totalItems: items.length,
        totalPages: 1,
        skip: 0,
        limit: items.length,
        items: mapper ? items.map(mapper) : (items as unknown as K[]),
      };
    }

    const [items, totalItems] = await Promise.all([
      collection.find(query, projection, { lean: true, sort, skip, limit }) as Promise<T[]>,
      collection.countDocuments(query),
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
