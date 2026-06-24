export type PlateNormalizeHints = {
    category?: string | null;
    plateSize?: string | null;
    plateColour?: string | null;
    plateType?: string | null;
    appendCategory?: boolean;
};

const PLATE_CATEGORY_SUFFIXES = ['RS', 'RH', 'BH', 'OM', 'CD', 'ROP', 'TMP', 'TR'];

const DIGIT_OCR_MAP: Record<string, string> = {
    Z: '2', O: '0', Q: '0', I: '1', L: '1', S: '5', B: '8',
};

function normalizeDigitsSegment(segment: string): string {
    return segment
        .split('')
        .map((ch) => (/\d/.test(ch) ? ch : (DIGIT_OCR_MAP[ch] ?? ch)))
        .join('')
        .replace(/\D/g, '');
}

function isKnownCategory(code: string): boolean {
    const upper = code.trim().toUpperCase();
    return PLATE_CATEGORY_SUFFIXES.includes(upper) || /^[A-Z]{1,3}$/.test(upper);
}

function isLongPlateContext(hints: PlateNormalizeHints): boolean {
    const size = (hints.plateSize ?? '').trim().toLowerCase().replace(/^e:/, '');
    if (size.includes('long') || size === 'l' || size.startsWith('lon')) return true;
    const colour = (hints.plateColour ?? '').trim().toLowerCase();
    const type = (hints.plateType ?? '').trim().toLowerCase();
    return colour === 'yellow' && type === 'private';
}

function isCategoryBleedOfPlateSuffix(plateSuffix: string, category: string): boolean {
    return (
        plateSuffix.length >= 2 &&
        category.length > plateSuffix.length &&
        category.endsWith(plateSuffix)
    );
}

function extractLongFormatDigits(plate: string, category?: string | null): string | null {
    let working = plate;
    const cat = category?.trim().toUpperCase();
    if (cat && working.endsWith(cat)) working = working.slice(0, -cat.length);
    for (const suffix of PLATE_CATEGORY_SUFFIXES) {
        if (working.endsWith(suffix) && working.length > suffix.length + 2) {
            working = working.slice(0, -suffix.length);
            break;
        }
    }
    let digits = '';
    for (let i = 0; i < working.length; i++) {
        const ch = working[i];
        const next = working[i + 1];
        if (/\d/.test(ch)) {
            if (cat && next === 'R' && cat.startsWith('R') && digits.length >= 3) break;
            digits += ch;
            continue;
        }
        if (DIGIT_OCR_MAP[ch] && digits.length > 0 && digits.length < 5) {
            digits += DIGIT_OCR_MAP[ch];
            continue;
        }
        if (/[A-Z]/.test(ch)) break;
    }
    digits = normalizeDigitsSegment(digits);
    if (digits.length >= 3 && digits.length <= 5) return digits;
    return null;
}

function composeLongPlate(digits: string, category?: string | null): string {
    const cat = category?.trim().toUpperCase();
    if (cat && isKnownCategory(cat)) return `${digits}${cat}`;
    return digits;
}

function normalizeStandardPlate(plate: string): string {
    const prefixMatch = plate.match(/^([A-Z]{1,3})(\d+)$/);
    if (prefixMatch) return `${prefixMatch[1]}${normalizeDigitsSegment(prefixMatch[2])}`;
    const suffixMatch = plate.match(/^(\d+)([A-Z]{1,3})$/);
    if (suffixMatch) return `${normalizeDigitsSegment(suffixMatch[1])}${suffixMatch[2]}`;
    if (/^\d+$/.test(plate)) return normalizeDigitsSegment(plate);
    return plate;
}

function shouldComposeFromCategory(
    plate: string,
    category: string,
    hints: PlateNormalizeHints,
    digits: string,
): boolean {
    if (hints.appendCategory === false || !isKnownCategory(category)) return false;
    const standard = normalizeStandardPlate(plate);
    const suffixMatch = standard.match(/^(\d+)([A-Z]{1,3})$/);
    if (suffixMatch) {
        const suffix = suffixMatch[2];
        if (isCategoryBleedOfPlateSuffix(suffix, category)) return false;
        if (suffix.length >= 2 && suffix !== category && !isLongPlateContext(hints)) return true;
        if (suffix.length === 1 && suffix === category) return true;
        if (suffix === category && suffixMatch[1] !== digits) return true;
    }
    if (isLongPlateContext(hints)) return true;
    if (/^\d+$/.test(plate)) return true;
    if (category && plate.endsWith(category) && plate.length > category.length + 2) return true;
    if (digits && plate !== `${digits}${category}`) {
        const withoutCat = category && plate.endsWith(category)
            ? plate.slice(0, -category.length)
            : plate;
        if (withoutCat !== digits && extractLongFormatDigits(plate, category) === digits) return true;
    }
    return false;
}

export function plateDigitCore(plate: string): string {
    const cleaned = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = cleaned.match(/^(\d+)/);
    return match?.[1] ?? cleaned;
}

export function normalizeOcrPlateNumber(
    raw: string | null | undefined,
    hints: PlateNormalizeHints = {},
): string | undefined {
    if (!raw?.trim()) return undefined;
    const plate = raw
        .trim().toUpperCase()
        .replace(/[\s؀-ۿ]/g, '')
        .replace(/[^A-Z0-9]/g, '');
    if (!plate) return undefined;
    const category = hints.category?.trim().toUpperCase();
    const digits =
        extractLongFormatDigits(plate, category) ??
        (/^\d+$/.test(plate) ? normalizeDigitsSegment(plate) : null);
    if (category && digits && digits.length >= 3 && shouldComposeFromCategory(plate, category, hints, digits)) {
        const composed = composeLongPlate(digits, category);
        if (composed.length >= 3) return composed;
    }
    const normalized = normalizeStandardPlate(plate);
    if (normalized.length < 3) return undefined;
    return normalized;
}

export type PlateCandidateInput = {
    value?: string | null;
    source: string;
    hints?: PlateNormalizeHints;
    confidence?: number;
};

function catEndsWith(plate: string, category?: string | null): boolean {
    const cat = category?.trim().toUpperCase();
    return Boolean(cat && plate.endsWith(cat));
}

export function pickBestPlateCandidate(candidates: PlateCandidateInput[]): { plate: string; source: string } | null {
    const scored: Array<{ plate: string; source: string; score: number; hints?: PlateNormalizeHints }> = [];
    for (const c of candidates) {
        if (!c.value?.trim()) continue;
        const hints: PlateNormalizeHints = {
            ...(c.hints ?? {}),
            appendCategory: c.source === 'plate_crop' ? false : c.hints?.appendCategory,
        };
        const normalized = normalizeOcrPlateNumber(c.value, hints);
        if (!normalized) continue;
        let score = 0;
        if (c.source === 'overlay') score += 80;
        else if (c.source === 'plate_crop') score += 70;
        else if (c.source === 'scene') score += 30;
        if (/^\d+[A-Z]{1,3}$/.test(normalized)) score += 30;
        else if (/^\d{3,5}$/.test(normalized)) score += 10;
        const cat = c.hints?.category?.trim().toUpperCase();
        if (cat && normalized.endsWith(cat)) score += 25;
        if ((c.confidence ?? 0) >= 90) score += 20;
        if (c.hints && isLongPlateContext(c.hints) && c.source === 'overlay') score += 15;
        scored.push({ plate: normalized, source: c.source, score, hints: c.hints });
    }
    if (scored.length === 0) return null;
    const overlay = scored.find((s) => s.source === 'overlay');
    const crop = scored.find((s) => s.source === 'plate_crop');
    if (overlay && crop) {
        const oDigits = plateDigitCore(overlay.plate);
        const cDigits = plateDigitCore(crop.plate);
        if (cDigits === `1${oDigits}`) crop.score -= 100;
        else if (oDigits !== cDigits) { crop.score -= 40; overlay.score += 25; }
        else if (catEndsWith(overlay.plate, overlay.hints?.category) && !catEndsWith(crop.plate, crop.hints?.category)) overlay.score += 20;
        else crop.score += 15;
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0] ? { plate: scored[0].plate, source: scored[0].source } : null;
}
