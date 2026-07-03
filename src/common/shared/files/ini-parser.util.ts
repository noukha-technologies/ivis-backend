/**
 * Minimal INI parser for the Admin PC OUT files (`[Section]` headers + key=value
 * lines, CRLF or LF). Returns a nested map: { section: { key: value } }.
 * Lines before the first section go under the '_' section.
 */
export function parseIni(
  content: string,
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let current = '_';
  result[current] = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;

    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      if (!result[current]) result[current] = {};
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    result[current][key] = value;
  }

  return result;
}

/**
 * Derive an overall pass/fail from the parsed OUT file: any `*genResult` /
 * `*TestResult` / `*_Status` value that reads as a failure → 'Failed', else
 * 'Passed' (when at least one result is present).
 */
export function deriveOverallResult(
  parsed: Record<string, Record<string, string>>,
): 'Passed' | 'Failed' | null {
  const flat = parsed['FlatResults'] ?? {};
  const values = Object.entries(flat)
    .filter(([k]) => /genResult$|TestResult$/i.test(k))
    .map(([, v]) => v.toLowerCase());

  if (values.length === 0) return null;
  const anyFail = values.some((v) => v.includes('fail'));
  return anyFail ? 'Failed' : 'Passed';
}
