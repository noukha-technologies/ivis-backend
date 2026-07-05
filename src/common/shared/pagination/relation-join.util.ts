import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Declarative description of one relation join for a query builder. Lets DAOs
 * say "join this relation with this alias / condition" instead of hand-writing
 * `.leftJoinAndSelect(...)` chains. Nested relations are expressed by listing
 * the parent first, then the child (e.g. `user.lineMappings` then
 * `lineMapping.line`).
 */
export type RelationJoin = {
  /** Relation path, e.g. 'user.lineMappings' or 'lineMapping.line'. */
  path: string;
  /** Alias for the joined table, e.g. 'lineMapping', 'line', 'centre'. */
  alias: string;
  /** Hydrate the relation onto the result (default true). false = join for filter/sort only. */
  select?: boolean;
  /** Join kind (default 'left'). */
  type?: 'left' | 'inner';
  /** Optional per-relation ON condition, e.g. 'lineMapping.is_deleted = :m_deleted'. */
  condition?: string;
  /** Parameters for `condition`. */
  params?: Record<string, unknown>;
};

/**
 * Apply a list of relation joins to a query builder. Idempotent: a join whose
 * alias is already present on the builder is skipped, so the same set can be
 * applied both in a shared base builder and via the pagination config without
 * producing a duplicate-alias error.
 */
export function applyRelationJoins<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  joins?: RelationJoin[],
): SelectQueryBuilder<T> {
  if (!joins?.length) {
    return qb;
  }

  for (const join of joins) {
    const alreadyJoined = qb.expressionMap.joinAttributes.some(
      (attr) => attr.alias?.name === join.alias,
    );
    if (alreadyJoined) {
      continue;
    }

    const inner = join.type === 'inner';
    const method =
      join.select === false
        ? inner
          ? 'innerJoin'
          : 'leftJoin'
        : inner
          ? 'innerJoinAndSelect'
          : 'leftJoinAndSelect';

    if (join.condition) {
      qb[method](join.path, join.alias, join.condition, join.params);
    } else {
      qb[method](join.path, join.alias);
    }
  }

  return qb;
}
