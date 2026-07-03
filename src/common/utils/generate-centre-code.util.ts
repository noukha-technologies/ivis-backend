/**
 * Centre code: `CM` + zero-padded sequential centre id (e.g. 1 → "CM001").
 * Derived from the unique `centre_id`, so the code is unique by construction.
 */
export function generateCentreCode(centreId: number): string {
  return `CM${String(centreId).padStart(3, '0')}`;
}
