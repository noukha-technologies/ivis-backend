/**
 * Request-safe stash for denormalized audit fields (customer_name, plate, …).
 *
 * TypeORM `event.entity` and AsyncLocalStorage can drop or race these values
 * before the audit row is written. Services put a plain snapshot here keyed by
 * entity id; the subscriber reads it synchronously in afterInsert/afterUpdate.
 */

type StashEntry = {
  after?: Record<string, unknown> | null;
  before?: Record<string, unknown> | null;
};

const stash = new Map<string, StashEntry>();

function key(entityName: string, entityId: string): string {
  return `${entityName}:${entityId}`;
}

export function stashAuditEntityDetails(
  entityName: string,
  entityId: string,
  details: {
    after?: Record<string, unknown> | null;
    before?: Record<string, unknown> | null;
  },
): void {
  if (!entityId) return;
  const existing = stash.get(key(entityName, entityId)) ?? {};
  stash.set(key(entityName, entityId), {
    after: details.after !== undefined ? details.after : existing.after,
    before: details.before !== undefined ? details.before : existing.before,
  });
}

/** Read and remove stashed details for this entity. */
export function takeAuditEntityDetails(
  entityName: string,
  entityId: string | null | undefined,
): StashEntry | null {
  if (!entityId) return null;
  const k = key(entityName, entityId);
  const entry = stash.get(k) ?? null;
  if (entry) stash.delete(k);
  return entry;
}
