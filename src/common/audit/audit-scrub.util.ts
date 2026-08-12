const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|hash|authorization|api[_-]?key|refresh)/i;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function scrubSensitiveFields(
  value: unknown,
): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    // Internal audit hints — never persisted in audit JSON.
    if (key.startsWith('__audit')) {
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = isBlank(entry) ? null : '[REDACTED]';
      continue;
    }
    if (
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      !(entry instanceof Date)
    ) {
      // Skip nested relation objects to keep payloads small and avoid cycles.
      continue;
    }
    // Skip arrays of objects (e.g. Camera.lines) — keep scalar arrays like line_ids.
    if (
      Array.isArray(entry) &&
      entry.some(
        (item) =>
          item !== null && typeof item === 'object' && !(item instanceof Date),
      )
    ) {
      continue;
    }
    if (entry instanceof Date) {
      result[key] = entry.toISOString();
    } else {
      result[key] = entry;
    }
  }
  return result;
}

/**
 * After scrubbing, mark sensitive fields that actually changed so the UI can
 * show "Password changed" without both sides looking identical ([REDACTED]).
 */
export function markSensitiveFieldChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  rawBefore?: unknown,
  rawAfter?: unknown,
): {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
} {
  const beforeOut = before ? { ...before } : {};
  const afterOut = after ? { ...after } : {};
  if (!after && !before) {
    return { before, after };
  }

  const rawB =
    rawBefore && typeof rawBefore === 'object' && !Array.isArray(rawBefore)
      ? (rawBefore as Record<string, unknown>)
      : {};
  const rawA =
    rawAfter && typeof rawAfter === 'object' && !Array.isArray(rawAfter)
      ? (rawAfter as Record<string, unknown>)
      : {};

  const keys = new Set([...Object.keys(rawB), ...Object.keys(rawA)]);
  for (const key of keys) {
    if (key.startsWith('__audit')) continue;
    if (!SENSITIVE_KEY_PATTERN.test(key)) continue;
    const b = rawB[key];
    const a = rawA[key];
    if (String(b ?? '') === String(a ?? '')) continue;
    beforeOut[key] = isBlank(b) ? null : '[REDACTED]';
    afterOut[key] = isBlank(a) ? null : '[CHANGED]';
  }

  return {
    before: Object.keys(beforeOut).length > 0 ? beforeOut : null,
    after: Object.keys(afterOut).length > 0 ? afterOut : null,
  };
}

export function humanizeEntityName(name: string): string {
  // "VehicleRecord" -> "Vehicle Record", "UserSession" -> "User Session"
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

export function buildActionDescription(
  action: string,
  entityName: string,
): string {
  const label = humanizeEntityName(entityName);
  switch (action) {
    case 'CREATE':
      return `Created ${label}`;
    case 'UPDATE':
      return `Updated ${label}`;
    case 'DELETE':
      return `Deleted ${label}`;
    case 'RESTORE':
      return `Restored ${label}`;
    case 'LOGIN':
      return 'Logged in';
    case 'LOGOUT':
      return 'Logged out';
    default:
      return `${action} ${label}`;
  }
}

export function resolveEntityId(
  entity: Record<string, unknown> | undefined,
): string | null {
  if (!entity) {
    return null;
  }
  const id = entity.id ?? entity.Id;
  if (id === null || id === undefined) {
    return null;
  }
  return String(id);
}
