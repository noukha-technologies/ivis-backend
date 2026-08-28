import { normalizeAnprColour } from './anpr-colour.util';

/**
 * Parser for the text strip Hikvision burns into the detection JPEG.
 *
 * The strip is a flat run of `Label:Value` pairs. The camera is consistent —
 * every field is separated by a colon — but the OCR pass over it is not: it
 * splits words ("Veh icle Brand"), confuses characters (V→U, S→3, W→U, /→~),
 * drops the odd colon, and wraps mid-token.
 *
 * So the colon is the anchor, not the label text. Every colon is treated as a
 * candidate separator: the text immediately before it is stripped to bare
 * letters and matched against the known label set, tolerating one or two
 * wrong characters. That recovers "Veh icle Brand:" and "Uehicle Color :" and
 * "Plate 3ize:" without needing a repair rule written for each one.
 *
 * Labels whose colon the OCR lost entirely are still found by a second,
 * regex-based pass, so a dropped colon costs that one field rather than
 * swallowing everything up to the next recognised label.
 */

export type HikvisionOverlayFields = {
  plateNumber?: string;
  captureTimeLabel?: string;
  confidence?: number;
  vehicleColour?: string;
  vehicleType?: string;
  vehicleBrand?: string;
  direction?: string;
  plateColour?: string;
  plateSize?: string;
  plateType?: string;
  province?: string;
  category?: string;
};

/** A field the strip carries, or a label we only need as a value boundary. */
type LabelSpec = {
  /** Absent for boundary-only labels (Camera Info, Device No., …). */
  field?: keyof HikvisionOverlayFields;
  /** Canonical label as the camera renders it. */
  label: string;
  /** Extra spellings the OCR produces that fuzzy matching alone will not reach. */
  aliases?: string[];
  /** Regex for the colon-less fallback pass. */
  pattern: RegExp;
  transform?: (raw: string) => string | number | undefined;
};

/**
 * Vehicle classes the camera reports.
 *
 * Doubles as an OCR-repair map (a misread "3edan" is still a Sedan) and as the
 * canonical spelling, so the same physical class is not stored three ways.
 * Anything outside the list is kept as read rather than discarded — an
 * unfamiliar class is data we do not want to lose — but only the entries here
 * are corrected.
 */
const VEHICLE_TYPE_FIXES: Record<string, string> = {
  '3edan': 'Sedan',
  sedan: 'Sedan',
  saloon: 'Sedan',
  suv: 'SUV',
  mpv: 'MPV',
  truck: 'Truck',
  lorry: 'Truck',
  bus: 'Bus',
  minibus: 'Minibus',
  coach: 'Bus',
  van: 'Van',
  pickup: 'Pickup',
  'pick-up': 'Pickup',
  hatchback: 'Hatchback',
  estate: 'Estate',
  coupe: 'Coupe',
  motorcycle: 'Motorcycle',
  motorbike: 'Motorcycle',
  motorcyle: 'Motorcycle',
  bike: 'Motorcycle',
  scooter: 'Motorcycle',
  trailer: 'Trailer',
  tanker: 'Tanker',
  taxi: 'Taxi',
  ambulance: 'Ambulance',
  tractor: 'Tractor',
};

/**
 * The camera's own words for these fields, in its spelling.
 *
 * Both are closed sets, so a value that is one OCR slip away from a known word
 * IS that word — "Reuerse" and "Priuate" are not new categories. Snapping them
 * back stops the same direction being stored under three spellings and the
 * reports grouping by them separately.
 */
const DIRECTION_WORDS = ['Forward', 'Reverse', 'Approaching', 'Leaving'];

const PLATE_TYPE_WORDS = [
  'Private',
  'Taxi',
  'Government',
  'Police',
  'Commercial',
  'Trailer',
  'Diplomatic',
  'Military',
];

/** Values the camera writes when it has nothing — never stored. */
const EMPTY_VALUES = new Set([
  'unknown',
  'unkown',
  'unknwon',
  'none',
  'null',
  'na',
  'n/a',
  '-',
  '--',
]);

function stripToLetters(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Characters this font's OCR confuses, folded onto one representative.
 *
 * Real captures come back with "5uv" and "Suu" for SUV, "8us" for Bus, "Uan"
 * for Van — S/5, B/8, U/V and friends are indistinguishable at overlay
 * resolution. Edit distance alone cannot rescue a three-letter class (one
 * wrong character out of three is not a typo, it is a different word), so the
 * confusable pairs are collapsed before comparing instead.
 */
const OCR_CONFUSIONS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  l: 'i',
  v: 'u',
};

function ocrFold(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => OCR_CONFUSIONS[ch] ?? ch)
    .filter((ch) => ch >= 'a' && ch <= 'z')
    .join('');
}

/** Levenshtein distance, capped — used only on short label/value tokens. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** One wrong character per six is the observed OCR error rate on this strip. */
function labelBudget(target: string): number {
  if (target.length < 5) return 0;
  return target.length >= 12 ? 2 : 1;
}

function fuzzyEquals(candidate: string, target: string): boolean {
  if (candidate === target) return true;
  return editDistance(candidate, target) <= labelBudget(target);
}

function isEmptyValue(raw: string): boolean {
  const flat = stripToLetters(raw);
  if (!flat) return EMPTY_VALUES.has(raw.trim().toLowerCase());
  if (EMPTY_VALUES.has(flat)) return true;
  // "unkn oun" → "unknoun" → one character off "unknown".
  return fuzzyEquals(flat, 'unknown');
}

export function normalizeOcrOverlayText(text: string): string {
  let flat = text
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Rejoin a timestamp the wrap split mid-seconds ("10:36:2 9" → "10:36:29").
  flat = flat.replace(
    /(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:)(\d)\s+(\d)\b/g,
    '$1$2$3',
  );
  return flat;
}

function trimFieldValue(raw: string): string {
  return raw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstWord(raw: string): string | undefined {
  return trimFieldValue(raw).split(/\s+/).filter(Boolean)[0];
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeVehicleType(raw: string): string | undefined {
  const value = trimFieldValue(raw);
  if (!value || isEmptyValue(value)) return undefined;
  // "SUV or MPV" is a single class in the camera's vocabulary, not a class
  // followed by a stray word. Recognise the phrase before splitting, so a
  // mangled "5UV or HPU" cannot be read as anything else, and store the head
  // of it — that is the word the Charges master and ROP both use.
  if (editDistance(ocrFold(value).slice(0, 8), ocrFold('SUVorMPV')) <= 2) {
    return 'SUV';
  }

  const word = firstWord(value);
  if (!word) return undefined;

  const key = word.toLowerCase().replace(/[^a-z-]/g, '');
  if (VEHICLE_TYPE_FIXES[key]) return VEHICLE_TYPE_FIXES[key];

  // Fold the confusable characters, then allow one genuine error on top.
  // "5uv" and "Suu" both fold to "suu", which is what "suv" folds to.
  const folded = ocrFold(word);
  if (folded) {
    for (const [candidate, canonical] of Object.entries(VEHICLE_TYPE_FIXES)) {
      const target = ocrFold(candidate);
      if (!target) continue;
      if (folded === target) return canonical;
      // Every pair of real classes differs by at least two characters once
      // folded, so a single edit cannot turn one into another.
      if (target.length >= 3 && editDistance(folded, target) <= 1) {
        return canonical;
      }
    }
  }

  return /^[A-Za-z-]{2,}$/.test(word) ? titleCase(word) : word;
}

function normalizePlateSize(raw: string): string | undefined {
  const value = trimFieldValue(raw).replace(/^e:/i, '');
  if (!value || isEmptyValue(value)) return undefined;
  const letters = stripToLetters(value);
  if (letters.startsWith('lon') || letters === 'l') return 'Long';
  if (letters.startsWith('sho') || letters === 's') return 'Short';
  return undefined;
}

function normalizeSimpleWord(raw: string): string | undefined {
  const value = trimFieldValue(raw);
  if (!value || isEmptyValue(value)) return undefined;
  const word = firstWord(value);
  return word ? titleCase(word) : undefined;
}

/**
 * The vocabulary word a value was meant to be, or the value as read.
 *
 * Folds the confusable characters first — the same trick the vehicle classes
 * need — then allows one genuine error on top. Anything that matches nothing
 * is kept rather than dropped: an unfamiliar word is still data, and a camera
 * configured for a category we have not seen should not read as empty.
 */
function snapToVocabulary(
  raw: string,
  vocabulary: readonly string[],
): string | undefined {
  const asRead = normalizeSimpleWord(raw);
  if (!asRead) return undefined;

  const folded = ocrFold(asRead);
  if (!folded) return asRead;

  let best: { word: string; distance: number } | null = null;
  for (const word of vocabulary) {
    const target = ocrFold(word);
    if (!target) continue;
    const distance = editDistance(folded, target);
    // One slip in a short word, two in a long one — the same budget the
    // labels use, since the failure is the same font and the same pass.
    if (distance > (target.length >= 8 ? 2 : 1)) continue;
    if (!best || distance < best.distance) best = { word, distance };
  }
  return best ? best.word : asRead;
}

function normalizeVehicleBrand(raw: string): string | undefined {
  // Keep make and model together ("GWM Haval"); the value already ends at the
  // next label. Only a stray leading colon needs removing.
  const value = trimFieldValue(raw).replace(/^:+\s*/, '');
  if (!value || isEmptyValue(value)) return undefined;
  return value
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const LABEL_SPECS: LabelSpec[] = [
  {
    field: 'plateNumber',
    label: 'Plate No.',
    pattern: /Plate\s*No\.?\s*:?\s*/i,
    transform: (raw) => {
      const value = trimFieldValue(raw);
      if (isEmptyValue(value)) return undefined;
      const cleaned = value
        .split(/\s+/)[0]
        .replace(/[^A-Za-z0-9\u0600-\u06FF-]/g, '')
        .toUpperCase();
      return cleaned || undefined;
    },
  },
  {
    field: 'captureTimeLabel',
    label: 'Capture Time',
    pattern: /Capture\s*Time\s*:?\s*/i,
    transform: (raw) =>
      trimFieldValue(raw).match(
        /^(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
      )?.[1],
  },
  {
    field: 'vehicleColour',
    label: 'Vehicle Color',
    aliases: ['Vehicle Colour', 'Uehicle Color'],
    pattern: /(?:Vehicle|Uehicle)\s*Colou?r\s*:?\s*/i,
    transform: (raw) =>
      isEmptyValue(raw) ? undefined : (normalizeAnprColour(raw) ?? undefined),
  },
  {
    field: 'vehicleType',
    label: 'Vehicle Type',
    aliases: ['Uehicle Type'],
    pattern: /(?:Vehicle|Uehicle)\s*Type\s*:?\s*/i,
    transform: normalizeVehicleType,
  },
  {
    field: 'vehicleBrand',
    label: 'Vehicle Brand',
    aliases: ['Uehicle Brand'],
    pattern: /(?:Vehicle|Uehicle)\s*Brand\s*:?\s*/i,
    transform: normalizeVehicleBrand,
  },
  {
    field: 'direction',
    label: 'Moving Direction',
    pattern: /Moving\s*Direction\s*:?\s*/i,
    transform: (raw) => snapToVocabulary(raw, DIRECTION_WORDS),
  },
  {
    field: 'confidence',
    label: 'Confidence',
    pattern: /Conf\s*idence\s*:?\s*/i,
    transform: (raw) => {
      const digits = trimFieldValue(raw).match(/(\d{1,3})/);
      if (!digits) return undefined;
      const value = parseInt(digits[1], 10);
      return value >= 0 && value <= 100 ? value : undefined;
    },
  },
  {
    field: 'plateColour',
    label: 'Plate Color',
    aliases: ['Plate Colour'],
    pattern: /Plate\s*Colou?r\s*:?\s*/i,
    transform: (raw) =>
      isEmptyValue(raw) ? undefined : (normalizeAnprColour(raw) ?? undefined),
  },
  {
    field: 'plateSize',
    label: 'Plate Size',
    aliases: ['Plate 3ize', 'Plate Siz'],
    pattern: /Plate\s*(?:Size|Siz|3ize)\s*:?\s*/i,
    transform: normalizePlateSize,
  },
  {
    field: 'plateType',
    label: 'Plate Type',
    pattern: /Plate\s*Type\s*:?\s*/i,
    transform: (raw) => snapToVocabulary(raw, PLATE_TYPE_WORDS),
  },
  {
    field: 'province',
    label: 'Province',
    pattern: /Province\s*:?\s*/i,
    transform: (raw) => (isEmptyValue(raw) ? undefined : trimFieldValue(raw)),
  },
  {
    field: 'category',
    label: 'Category',
    pattern: /Category\s*:?\s*/i,
    transform: (raw) => {
      const value = trimFieldValue(raw)
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase();
      return value || undefined;
    },
  },
  // Boundary-only: never stored, but a value must stop when one begins.
  { label: 'Camera Info', pattern: /Camera\s*Info\s*:?\s*/i },
  { label: 'Device No.', pattern: /Device\s*No\.?\s*:?\s*/i },
  { label: 'Camera No.', pattern: /Camera\s*No\.?\s*:?\s*/i },
  {
    label: 'Area/Country',
    aliases: ['Area~Country', 'Area-Country', 'AreaCountry'],
    pattern: /Area[\s\-~/]*Country\s*:?\s*/i,
  },
];

/** Canonical letter-only key → spec, including declared aliases. */
const LABEL_INDEX: Array<{ key: string; spec: LabelSpec }> =
  LABEL_SPECS.flatMap((spec) =>
    [spec.label, ...(spec.aliases ?? [])].map((name) => ({
      key: stripToLetters(name),
      spec,
    })),
  );

/** Longest label, in characters, plus room for OCR-injected spaces. */
const MAX_LABEL_LOOKBACK = 24;

type Hit = { spec: LabelSpec; labelStart: number; valueStart: number };

/**
 * Every colon is a candidate separator: walk back over the text before it and
 * take the longest run that matches a known label.
 */
function colonAnchoredHits(flat: string): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] !== ':') continue;
    // A colon inside a timestamp is not a separator.
    if (/\d/.test(flat[i - 1] ?? '') && /\d/.test(flat[i + 1] ?? '')) continue;

    const from = Math.max(0, i - MAX_LABEL_LOOKBACK);
    const before = flat.slice(from, i);

    // Score every start against every label and keep the closest fit. Taking
    // the first match instead let a leading fragment of the PREVIOUS value be
    // absorbed as edit distance — "an Veh icle Brand" matched "Vehicle Brand"
    // within budget, so the label appeared to start two characters early and
    // "Sedan" was truncated to "Sed".
    let best: (Hit & { distance: number; keyLength: number }) | null = null;
    for (let start = 0; start < before.length; start++) {
      const candidate = stripToLetters(before.slice(start));
      if (candidate.length < 4) break;
      for (const entry of LABEL_INDEX) {
        const distance = editDistance(candidate, entry.key);
        if (distance > labelBudget(entry.key)) continue;
        // Ties break toward the TIGHTEST span. stripToLetters discards digits,
        // so a window opening 20 characters early yields the same letters as
        // one opening on the label itself — "2026 09:34:22 Plate No." and
        // "Plate No." both reduce to "plateno". Preferring the later start
        // keeps the previous field's value out of this label's span.
        const better =
          !best ||
          distance < best.distance ||
          (distance === best.distance && entry.key.length > best.keyLength) ||
          (distance === best.distance &&
            entry.key.length === best.keyLength &&
            from + start > best.labelStart);
        if (better) {
          best = {
            spec: entry.spec,
            labelStart: from + start,
            valueStart: i + 1,
            distance,
            keyLength: entry.key.length,
          };
        }
      }
    }
    if (best) {
      hits.push({
        spec: best.spec,
        labelStart: best.labelStart,
        valueStart: best.valueStart,
      });
    }
  }
  return hits;
}

/** Fallback for labels whose colon the OCR dropped entirely. */
function regexHits(flat: string): Hit[] {
  const hits: Hit[] = [];
  for (const spec of LABEL_SPECS) {
    const re = new RegExp(spec.pattern.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(flat)) !== null) {
      hits.push({
        spec,
        labelStart: match.index,
        valueStart: match.index + match[0].length,
      });
    }
  }
  return hits;
}

function mergeHits(flat: string): Hit[] {
  const all = [...colonAnchoredHits(flat), ...regexHits(flat)].sort(
    (a, b) => a.labelStart - b.labelStart || b.valueStart - a.valueStart,
  );

  const merged: Hit[] = [];
  for (const hit of all) {
    const last = merged[merged.length - 1];
    // Overlapping hits describe the same label — the colon-anchored one sorts
    // first and wins, since it knows where the value actually begins.
    if (last && hit.labelStart < last.valueStart) continue;
    merged.push(hit);
  }
  return merged;
}

export function flattenHikvisionOverlayText(text: string): string {
  return normalizeOcrOverlayText(text);
}

export function parseHikvisionOverlayFields(
  text: string,
): HikvisionOverlayFields {
  const flat = normalizeOcrOverlayText(text);
  const hits = mergeHits(flat);
  const result: HikvisionOverlayFields = {};

  for (let i = 0; i < hits.length; i++) {
    const { spec, valueStart } = hits[i];
    if (!spec.field) continue; // boundary-only label
    const valueEnd = i + 1 < hits.length ? hits[i + 1].labelStart : flat.length;
    const raw = flat.slice(valueStart, valueEnd).trim();
    if (!raw) continue;

    const transformed = spec.transform
      ? spec.transform(raw)
      : trimFieldValue(raw);
    if (transformed === undefined || transformed === '') continue;
    if (result[spec.field] === undefined) {
      (result as Record<string, string | number>)[spec.field] = transformed;
    }
  }

  return result;
}

export function parseCaptureTimeLabel(label: string): Date | null {
  const cleaned = label.replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, mi, ss] = m;
  const dt = new Date(
    parseInt(yyyy, 10),
    parseInt(mm, 10) - 1,
    parseInt(dd, 10),
    parseInt(hh, 10),
    parseInt(mi, 10),
    parseInt(ss, 10),
  );
  return Number.isNaN(dt.getTime()) ? null : dt;
}
