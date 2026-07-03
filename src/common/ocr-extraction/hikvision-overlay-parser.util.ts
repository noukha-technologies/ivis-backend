import { normalizeAnprColour } from './anpr-colour.util';

const OVERLAY_LABEL =
  '(?:Camera\\s*Info|Device\\s*No\\.?|Capture\\s*Time|Plate\\s*No\\.?|Vehicle\\s*Colou?r|Vehicle\\s*Type|Vehicle\\s*Brand|Uehicle\\s*Brand|Moving\\s*Direction|Confidence|Camera\\s*No\\.?|Area[s\\-/]?Country|Plate\\s*Colou?r|Plate\\s*(?:Size|Siz|3ize)|Plate\\s*Type|Province|Category)';

const NEXT_LABEL_RE = new RegExp(`\\s+(?=${OVERLAY_LABEL}\\s*:)`, 'i');

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

type LabelSpec = {
  field: keyof HikvisionOverlayFields;
  pattern: RegExp;
  transform?: (raw: string) => string | number | undefined;
};

const VEHICLE_TYPE_FIXES: Record<string, string> = {
  '3edan': 'Sedan',
  sedan: 'Sedan',
  suv: 'SUV',
  mpv: 'MPV',
  truck: 'Truck',
  bus: 'Bus',
  van: 'Van',
  pickup: 'Pickup',
  hatchback: 'Hatchback',
};

export function normalizeOcrOverlayText(text: string): string {
  let flat = text
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  flat = flat.replace(
    /(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:)(\d)\s+(\d)\b/g,
    '$1$2$3',
  );
  const repairs: Array<[RegExp, string]> = [
    [/\bVe\s+hicle\b/gi, 'Vehicle'],
    [/\bVehi\s+cle\b/gi, 'Vehicle'],
    [/\bhicle\s+Brand\b/gi, 'Vehicle Brand'],
    [/\bUehicle\b/gi, 'Vehicle'],
    [/\bConf\s+idence\b/gi, 'Confidence'],
    [/\bC\s+amera\b/gi, 'Camera'],
    [/\bArea\s+Country\b/gi, 'Area/Country'],
    [/\bPlate\s+3ize\b/gi, 'Plate Size'],
    [/\bPlate\s+Siz\b/gi, 'Plate Size'],
    [/\bPlate\s+Si\s+ze\b/gi, 'Plate Size'],
    [/\bLon\s+q\b/gi, 'Long'],
    [/\b3edan\b/gi, 'Sedan'],
    [/\b0OMN\b/gi, 'OMN'],
    [/\b0MN\b/gi, 'OMN'],
    [/\b96\s*x\b/gi, '96%'],
    [/\bProvince\s+unknown\b/gi, 'Province:unknown'],
  ];
  for (const [pattern, replacement] of repairs) {
    flat = flat.replace(pattern, replacement);
  }
  return flat;
}

function trimFieldValue(raw: string): string {
  let value = raw.replace(/\|/g, ' ').trim();
  const boundary = value.search(NEXT_LABEL_RE);
  if (boundary > 0) value = value.slice(0, boundary).trim();
  return value.replace(/\s+/g, ' ').trim();
}

type LabelHit = {
  field: keyof HikvisionOverlayFields;
  start: number;
  valueStart: number;
  spec: LabelSpec;
};

function collectLabelHits(flat: string): LabelHit[] {
  const hits: Array<LabelHit & { labelLen: number }> = [];
  for (const spec of LABEL_SPECS) {
    const re = new RegExp(spec.pattern.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(flat)) !== null) {
      hits.push({
        field: spec.field,
        start: match.index,
        valueStart: match.index + match[0].length,
        spec,
        labelLen: match[0].length,
      });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.labelLen - a.labelLen);
  const deduped: LabelHit[] = [];
  let lastStart = -1;
  for (const hit of hits) {
    if (hit.start === lastStart) continue;
    if (
      deduped.length > 0 &&
      hit.start < deduped[deduped.length - 1].valueStart
    )
      continue;
    deduped.push({
      field: hit.field,
      start: hit.start,
      valueStart: hit.valueStart,
      spec: hit.spec,
    });
    lastStart = hit.start;
  }
  return deduped;
}

function normalizeVehicleType(
  raw: string | null | undefined,
): string | undefined {
  if (!raw?.trim()) return undefined;
  let value = trimFieldValue(raw);
  value = value.replace(/\s+Vehicle\s*Brand.*/i, '').trim();
  const word = value.split(/\s+/).filter(Boolean)[0];
  if (!word) return undefined;
  const fixed = VEHICLE_TYPE_FIXES[word.toLowerCase()];
  if (fixed) return fixed;
  if (/^[A-Za-z]{2,}$/.test(word))
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  return word;
}

function normalizePlateSize(
  raw: string | null | undefined,
): string | undefined {
  if (!raw?.trim()) return undefined;
  const value = trimFieldValue(raw).replace(/^e:/i, '');
  const lower = value.toLowerCase();
  if (/\blong\b/.test(lower) || lower === 'l' || lower.startsWith('lon'))
    return 'Long';
  if (/\bshort\b/.test(lower) || lower.startsWith('sho')) return 'Short';
  return undefined;
}

function normalizePlateType(
  raw: string | null | undefined,
): string | undefined {
  if (!raw?.trim()) return undefined;
  const value = trimFieldValue(raw);
  const word = value.split(/\s+/)[0];
  if (!word) return undefined;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function normalizeVehicleBrand(
  raw: string | null | undefined,
): string | undefined {
  if (!raw?.trim()) return undefined;
  // Keep the full brand (make + model, e.g. "GWM Haval") — trimFieldValue already
  // bounds it to the next overlay label. Strip a stray leading colon only.
  const value = trimFieldValue(raw)
    .replace(/^:+\s*/, '')
    .trim();
  if (!value) return undefined;
  return value
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const LABEL_SPECS: LabelSpec[] = [
  {
    field: 'plateNumber',
    pattern: /Plate\s*No\.?\s*:?\s*/i,
    transform: (raw) => raw.replace(/[^A-Za-z0-9؀-ۿ-]/g, '').toUpperCase(),
  },
  {
    field: 'captureTimeLabel',
    pattern: /Capture\s*Time\s*:?\s*/i,
    transform: (raw) => {
      const m = trimFieldValue(raw).match(
        /^(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
      );
      return m?.[1];
    },
  },
  {
    field: 'vehicleColour',
    pattern: /Vehicle\s*Colou?r\s*:?\s*/i,
    transform: (raw) => normalizeAnprColour(raw) ?? undefined,
  },
  {
    field: 'vehicleType',
    pattern: /Vehicle\s*Type\s*:?\s*/i,
    transform: (raw) => normalizeVehicleType(raw),
  },
  {
    field: 'vehicleBrand',
    pattern: /(?:Vehicle|Uehicle)\s*Brand\s*:?\s*/i,
    transform: (raw) => normalizeVehicleBrand(raw),
  },
  {
    field: 'direction',
    pattern: /Moving\s*Direction\s*:?\s*/i,
    transform: (raw) => {
      const v = trimFieldValue(raw).split(/\s+/)[0];
      return v
        ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
        : undefined;
    },
  },
  {
    field: 'confidence',
    pattern: /Confidence\s*:?\s*/i,
    transform: (raw) => {
      const digits = trimFieldValue(raw).match(/(\d{1,3})/);
      return digits ? parseInt(digits[1], 10) : undefined;
    },
  },
  {
    field: 'plateColour',
    pattern: /Plate\s*Colou?r\s*:?\s*/i,
    transform: (raw) => normalizeAnprColour(raw) ?? undefined,
  },
  {
    field: 'plateSize',
    pattern: /Plate\s*(?:Size|Siz|3ize)\s*:?\s*/i,
    transform: (raw) => normalizePlateSize(raw),
  },
  {
    field: 'plateType',
    pattern: /Plate\s*Type\s*:?\s*/i,
    transform: (raw) => normalizePlateType(raw),
  },
  {
    field: 'province',
    pattern: /Province\s*:?\s*/i,
    transform: (raw) => trimFieldValue(raw),
  },
  {
    field: 'category',
    pattern: /Category\s*:?\s*/i,
    transform: (raw) =>
      trimFieldValue(raw)
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase(),
  },
];

export function flattenHikvisionOverlayText(text: string): string {
  return normalizeOcrOverlayText(text);
}

export function parseHikvisionOverlayFields(
  text: string,
): HikvisionOverlayFields {
  const flat = normalizeOcrOverlayText(text);
  const hits = collectLabelHits(flat);
  const result: HikvisionOverlayFields = {};
  for (let i = 0; i < hits.length; i++) {
    const { field, valueStart, spec } = hits[i];
    const valueEnd = i + 1 < hits.length ? hits[i + 1].start : flat.length;
    const raw = flat.slice(valueStart, valueEnd).trim();
    if (!raw) continue;
    const transformed = spec.transform
      ? spec.transform(raw)
      : trimFieldValue(raw);
    if (transformed === undefined || transformed === '') continue;
    if (result[field] === undefined) {
      (result as Record<string, string | number>)[field] = transformed;
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
