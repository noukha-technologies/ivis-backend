/**
 * Normalize an Oman phone number to the canonical `+968 XXXXXXXX` form.
 *
 * Accepts whatever the operator typed — spaces, dashes, a `+968`/`00968`/`968`
 * country code or a leading `0` — and reduces it to the 8-digit national number,
 * then re-applies the `+968 ` prefix. If the result is not a valid 8-digit Oman
 * number the input is returned unchanged so validation can reject it.
 */
export function normalizeOmanPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  let digits = value.replace(/\D/g, ''); // strip +, spaces, dashes, etc.

  // Drop the country code in any of its common forms.
  if (digits.startsWith('00968')) digits = digits.slice(5);
  else if (digits.startsWith('968') && digits.length > 8) digits = digits.slice(3);

  // Drop a stray leading zero (e.g. 091234567).
  if (digits.length === 9 && digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length !== 8) return value.trim();

  return `+968 ${digits}`;
}
