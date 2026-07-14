const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|hash|authorization|api[_-]?key|refresh)/i;

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
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
      continue;
    }
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry) && !(entry instanceof Date)) {
      // Skip nested relation objects to keep payloads small and avoid cycles.
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

export function resolveEntityId(entity: Record<string, unknown> | undefined): string | null {
  if (!entity) {
    return null;
  }
  const id = entity.id ?? entity.Id;
  if (id === null || id === undefined) {
    return null;
  }
  return String(id);
}
