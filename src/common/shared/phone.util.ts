import { toLocalOmanDigits } from '../utils/oman-phone.util';

/**
 * Normalize an Oman phone number to the bare 8-digit local form IVIS stores.
 *
 * Accepts whatever arrives — spaces, dashes, a `+968`/`00968`/`968` country
 * code or a leading `0`. If the result is not a valid 8-digit Oman number the
 * input is returned trimmed but unchanged, so validation rejects it with a
 * message about the number rather than silently storing something else.
 *
 * This used to re-apply a `+968 ` prefix, which was the odd one out: every
 * other writer (ANPR/ROP enrichment, the appointment ingest, the walk-in and
 * job forms) stores 8 bare digits, and the UI validates 8 digits. A booking
 * whose customer came through this path was therefore stored as
 * `+968 93472815` and then rejected by the very form meant to edit it. The
 * delegation below is deliberate — one canonical form, one implementation.
 */
export function normalizeOmanPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return toLocalOmanDigits(value) ?? value.trim();
}
