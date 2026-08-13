/**
 * Reduces a phone number to the bare 8-digit Oman local form.
 *
 * External systems quote numbers inconsistently — ROP returns them one way, the
 * appointment provider sends E.164 (`+96894567890`) — but IVIS stores and
 * validates the 8-digit local number the customer forms expect. Normalising on
 * the way in means an operator is never asked to hand-edit a number that
 * arrived perfectly valid.
 *
 * Handles `00968…`, `968…`, `+968…` and a leading domestic `0`. Returns
 * undefined when the result is not 8 digits, so a partial or foreign number is
 * left for an operator rather than stored in a shape that fails validation.
 */
export function toLocalOmanDigits(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;

  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('00968')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('968') && digits.length > 8) {
    digits = digits.slice(3);
  }

  // Domestic trunk prefix, e.g. 091234567.
  if (digits.length === 9 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits.length === 8 ? digits : undefined;
}
