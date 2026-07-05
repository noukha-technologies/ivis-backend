/**
 * Internal vehicle-type classification code: `VT-{TYPE3}-{WEIGHT_INITIAL}`.
 * - TYPE3 = first 3 alphanumerics of the (free-text) vehicle type, uppercased.
 * - WEIGHT_INITIAL = first alphabetic char of the charge category's weight.
 *
 * e.g. ("Sedan", "Light") → "VT-SED-L"; ("SUV", "Heavy") → "VT-SUV-H".
 * The code is the identity of a vehicle master row, so same type + weight
 * yields the same code (blocked by the unique `code` index → no duplicates).
 */
export function generateVehicleCode(
  vehicleType: string,
  vehicleWeight?: string | null,
): string {
  const type3 = (vehicleType ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();

  const weightInitial = (vehicleWeight ?? '')
    .replace(/[^a-zA-Z]/g, '')
    .charAt(0)
    .toUpperCase();

  return weightInitial ? `VT-${type3}-${weightInitial}` : `VT-${type3}`;
}
