/** Trim and remove all whitespace; preserve other characters (e.g. IV-01). */
export function normalizeUserCode(userCode: string): string {
  return userCode.trim().replace(/\s+/g, '');
}
