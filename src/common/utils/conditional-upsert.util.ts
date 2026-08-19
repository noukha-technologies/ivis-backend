import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

/**
 * Upserts rows into an entity's table via raw SQL:
 * `INSERT ... ON CONFLICT (<conflictColumns>) DO UPDATE SET ...`.
 *
 * - `conditional: false` (bucket A — central always wins): unconditional
 *   overwrite, every column, every time.
 * - `conditional: true` (bucket C — most-recent-wins): the UPDATE only
 *   applies if the incoming row's `updated_at` is strictly newer than the
 *   row already at the target — otherwise it's a silent no-op, which is
 *   exactly what makes "most-recent-wins" actually true instead of
 *   "whichever phase of the sync run wrote last wins" (see
 *   DATABASE_SYNC_PLAN.md §6.3 for the bug this fixes).
 * - `conflictColumns` (default `['id']`): which columns Postgres should treat
 *   as the conflict target. Most synced tables only need the PK, but a table
 *   with an additional unique constraint that two independently-generated
 *   rows can legitimately collide on (e.g. `role_centre_mappings`'s
 *   `(role_id, centre_id)` — one row can be created locally by Onboarding
 *   Sync and a *different*-`id` row for the same pair pulled later by
 *   Database Sync) must upsert against that constraint instead, or Postgres
 *   raises a duplicate-key error on the constraint `ON CONFLICT (id)` never
 *   covers, since it's a genuinely different unmatched conflict target.
 * - `conflictIndexPredicate`: required when `conflictColumns` targets a
 *   *partial* unique index (e.g. `... WHERE is_deleted = false`) — Postgres
 *   only infers a partial index as the conflict target when `ON CONFLICT`
 *   repeats its exact predicate.
 *
 * Row-by-row (not batched) — acceptable for a scheduled/manual sync of
 * modest per-run volume, and keeps the parameterized SQL simple/safe.
 *
 * Returns the number of rows actually written (inserted or updated) — a
 * conditional no-op does not count.
 */
export async function upsertWithUpdate<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  rows: T[],
  options: {
    conditional: boolean;
    conflictColumns?: string[];
    conflictIndexPredicate?: string;
    /**
     * Columns the incoming row must never write. For values that belong to the
     * receiving box alone — a locally-issued credential, say — where the sender
     * legitimately holds null and a blind overwrite would destroy local state.
     * Applies to the UPDATE half only: an INSERT still needs the full column
     * list, and on a fresh row there is no local value to protect.
     */
    localOnlyColumns?: string[];
  },
): Promise<number> {
  if (!rows.length) return 0;

  const metadata = manager.connection.getMetadata(entity);
  const table = `"${metadata.schema}"."${metadata.tableName}"`;
  const columns = metadata.columns;
  const columnNames = columns.map((c) => c.databaseName);
  const columnList = columnNames.map((c) => `"${c}"`).join(', ');
  const conflictColumns = options.conflictColumns ?? ['id'];
  const conflictTarget = conflictColumns.map((c) => `"${c}"`).join(', ');
  const conflictPredicate = options.conflictIndexPredicate
    ? ` WHERE ${options.conflictIndexPredicate}`
    : '';
  // Never overwrite the existing row's own PK on conflict — a secondary-key
  // conflict target (e.g. role_id+centre_id) means an existing row with a
  // *different* id already represents this logical pair; the incoming id
  // must be discarded, not applied, or the row's identity would silently
  // change underneath anything that already referenced it.
  const excludedFromUpdate = new Set([
    ...conflictColumns,
    'id',
    ...(options.localOnlyColumns ?? []),
  ]);
  const updateSet = columnNames
    .filter((name) => !excludedFromUpdate.has(name))
    .map((name) => `"${name}" = EXCLUDED."${name}"`)
    .join(', ');
  const whereClause = options.conditional
    ? ` WHERE ${table}."updated_at" < EXCLUDED."updated_at"`
    : '';

  let written = 0;
  for (const row of rows) {
    const rowRecord = row as unknown as Record<string, unknown>;
    const values = columns.map((column) => {
      const raw = rowRecord[column.propertyName];
      if (raw != null && (column.type === 'jsonb' || column.type === 'json')) {
        return JSON.stringify(raw);
      }
      return raw ?? null;
    });
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const result: unknown[] = await manager.query(
      `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})
       ON CONFLICT (${conflictTarget})${conflictPredicate} DO UPDATE SET ${updateSet}${whereClause}
       RETURNING id`,
      values,
    );
    if (Array.isArray(result) && result.length > 0) {
      written++;
    }
  }
  return written;
}
