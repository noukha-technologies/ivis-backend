/**
 * Naming convention for the Admin PC exchange files.
 *
 *   <PLATE>-infile-<YYYYMMDD>.data
 *   <PLATE>-outfile-<YYYYMMDD>.res.txt
 *
 * The plate leads so a folder listing groups a vehicle's files together, and
 * the date is YYYYMMDD so the listing also sorts chronologically — DD-MM-YYYY
 * would sort 01-09 before 17-08.
 *
 * The date is the Oman business day, not the server's. Inspections are keyed to
 * an Oman day everywhere else (the ROP same-day submission rule, the provider's
 * booking match), so a file stamped in another timezone could name a different
 * day than the job it belongs to.
 */

/** Strips separators and upper-cases, the same normalisation ANPR applies. */
export function normalizePlateForFileName(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** YYYYMMDD for the given instant, in Oman local time. */
export function omanDateStamp(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Muscat',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(at)
    .replace(/-/g, '');
}

export function buildInFileName(plate: string, at: Date = new Date()): string {
  return `${normalizePlateForFileName(plate)}-infile-${omanDateStamp(at)}.data`;
}

export function buildOutFileName(plate: string, at: Date = new Date()): string {
  return `${normalizePlateForFileName(plate)}-outfile-${omanDateStamp(at)}.res.txt`;
}

/**
 * Reads the plate and day out of an OUT file name following the convention.
 * Returns null for a name that does not match, which the watcher treats as
 * "not one of ours" rather than an error.
 */
export function parseOutFileName(
  fileName: string,
): { plate: string; date: string } | null {
  const match = /^([A-Za-z0-9]+)-outfile-(\d{8})\.(?:res\.txt|res|txt)$/i.exec(
    fileName.trim(),
  );
  if (!match) return null;
  return { plate: match[1].toUpperCase(), date: match[2] };
}
