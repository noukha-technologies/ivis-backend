/**
 * Normalizes a vehicle type to a trimmed lowercase string so it can be compared
 * reliably against the configured charge mappings. Vehicle type is free text
 * (sourced from ANPR / ROP / appointment), never a fixed list.
 */
export function normalizeVehicleType(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/**
 * Synonyms that name the same physical class of vehicle.
 *
 * The camera, ROP and the Charges master were each configured by different
 * people and do not share a vocabulary — one says "Saloon", another "Sedan";
 * one "Lorry", another "Truck". Comparing the raw strings would report a
 * disagreement on every second vehicle, so both sides are reduced to a class
 * first.
 */
const VEHICLE_CLASS_SYNONYMS: Record<string, string> = {
  sedan: 'sedan',
  saloon: 'sedan',
  suv: 'suv',
  jeep: 'suv',
  mpv: 'mpv',
  minivan: 'mpv',
  van: 'van',
  minibus: 'minibus',
  bus: 'bus',
  coach: 'bus',
  truck: 'truck',
  lorry: 'truck',
  pickup: 'pickup',
  pick: 'pickup',
  hatchback: 'hatchback',
  estate: 'estate',
  wagon: 'estate',
  coupe: 'coupe',
  motorcycle: 'motorcycle',
  motorbike: 'motorcycle',
  bike: 'motorcycle',
  scooter: 'motorcycle',
  trailer: 'trailer',
  tanker: 'tanker',
  taxi: 'taxi',
  ambulance: 'ambulance',
  tractor: 'tractor',
};

/**
 * The class a vehicle-type string names, or null when it names nothing usable.
 *
 * Returns the raw lowercase word for anything outside the synonym table — an
 * unfamiliar class is still comparable with itself, and silently collapsing it
 * to null would hide a real disagreement.
 */
export function vehicleClassOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const word = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .replace(/-/g, '');
  if (!word || word === 'unknown' || word === 'none') return null;

  const direct = VEHICLE_CLASS_SYNONYMS[word];
  if (direct) return direct;

  // Fold the characters OCR confuses before giving up. A capture stored as
  // "5uv" or "Suu" is an SUV, and reporting it as disagreeing with ROP's
  // "SUV" would be an alarm about the reader, not about the vehicle.
  const folded = ocrFoldClass(value);
  if (folded) {
    for (const [candidate, canonical] of Object.entries(
      VEHICLE_CLASS_SYNONYMS,
    )) {
      if (ocrFoldClass(candidate) === folded) return canonical;
    }
  }

  return word;
}

/** Mirrors the fold in hikvision-overlay-parser.util — see the note there. */
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

function ocrFoldClass(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((ch) => OCR_CONFUSIONS[ch] ?? ch)
    .filter((ch) => ch >= 'a' && ch <= 'z')
    .join('');
}

/**
 * Whether two vehicle-type strings describe the same class.
 *
 * Unknown on either side is not a disagreement — it is an absence, and
 * reporting it as a mismatch would cry wolf on every frame the camera could
 * not classify.
 */
export function vehicleTypesAgree(a: unknown, b: unknown): boolean {
  const left = vehicleClassOf(a);
  const right = vehicleClassOf(b);
  if (left === null || right === null) return true;
  return left === right;
}
