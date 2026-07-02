/**
 * Normalizes a vehicle type to a trimmed lowercase string so it can be compared
 * reliably against the configured charge mappings. Vehicle type is free text
 * (sourced from ANPR / ROP / appointment), never a fixed list.
 */
export function normalizeVehicleType(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
