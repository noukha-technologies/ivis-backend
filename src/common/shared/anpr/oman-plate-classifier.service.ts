import { Injectable } from '@nestjs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlateColorCategory =
    | 'PVT'        // Private (regular)
    | 'GOV'        // Government
    | 'DIP'        // Diplomatic / Consular
    | 'TRP'        // Heavy Transport / Commercial
    | 'PVT-EV'     // Private EV
    | 'COM-EV'     // Commercial / Taxi / Rental EV
    | 'OFF-EV'     // Off-road EV (not for public roads)
    | 'UNK';       // Unknown / unresolved

export type PlateTypeCategory =
    | 'PVT'        // Private (numeric plate)
    | 'GOV'        // Government  (G prefix)
    | 'DIW'        // Diwan of Royal Court (D prefix)
    | 'RC'         // Royal Court (RC prefix)
    | 'DIP'        // Diplomatic (CD prefix)
    | 'MIL'        // Military (M prefix)
    | 'ROP'        // Royal Oman Police (ROP prefix)
    | 'POL'        // Police (P prefix)
    | 'TAX'        // Taxi (T prefix)
    | 'TRP'        // Transport (TR prefix)
    | 'RNT'        // Rent-a-Car (R prefix)
    | 'TMP'        // Temporary (TMP prefix)
    | 'UNK';       // Unrecognized

/** Result of full Oman plate classification. */
export interface OmanPlateClassification {
    /** Derived plate type name, e.g. "Government". */
    plateType: string;
    /** Short category code, e.g. "GOV". */
    plateTypeCategory: PlateTypeCategory;
    /** Category derived from plate colour, e.g. "PVT-EV". */
    plateColorCategory: PlateColorCategory;
    /** Normalised plate colour name, e.g. "Green". */
    plateColorName: string;
    /** True when this is an EV plate. */
    isEV: boolean;
    /** True when the event should trigger an alert in the dashboard. */
    shouldAlert: boolean;
    /** Human-readable reason for the alert (null if no alert). */
    alertReason: string | null;
    /** Whether colour was resolved from XML ("xml"), or fell back to "none". */
    colorSource: 'xml' | 'none';
    /** True when plate appears to be a 4-digit year (should be skipped). */
    isYearPlate: boolean;
}

// ─── Colour table ─────────────────────────────────────────────────────────────

interface ColorEntry {
    colorName: string;
    category: PlateColorCategory;
    ev: boolean;
    alert: boolean;
    note: string;
}

const PLATE_COLOR_TABLE: Record<string, ColorEntry> = {
    // ── Regular plates ──────────────────────────────────────────────────────
    green: {
        colorName: 'Green',
        category: 'PVT',
        ev: false,
        alert: false,
        note: 'Regular private vehicle',
    },
    white: {
        colorName: 'White',
        category: 'GOV',
        ev: false,
        alert: true,
        note: 'Government vehicle — verify authorization',
    },
    blue: {
        colorName: 'Blue',
        category: 'DIP',
        ev: false,
        alert: true,
        note: 'Diplomatic / Consular vehicle — verify authorization',
    },
    'dark blue': {
        colorName: 'Blue',
        category: 'DIP',
        ev: false,
        alert: true,
        note: 'Diplomatic / Consular vehicle — verify authorization',
    },
    orange: {
        colorName: 'Orange',
        category: 'TRP',
        ev: false,
        alert: false,
        note: 'Heavy transport / Commercial vehicle',
    },
    // ── EV plates ────────────────────────────────────────────────────────────
    yellow: {
        colorName: 'Yellow',
        category: 'PVT-EV',
        ev: true,
        alert: false,
        note: 'Electric vehicle — Private',
    },
    red: {
        colorName: 'Red',
        category: 'COM-EV',
        ev: true,
        alert: false,
        note: 'Electric vehicle — Commercial / Taxi / Rental',
    },
    black: {
        colorName: 'Black',
        category: 'OFF-EV',
        ev: true,
        alert: true,
        note: 'Electric vehicle — Not for public roads',
    },
};

// ─── Plate number rules ───────────────────────────────────────────────────────

interface PlateRule {
    pattern: RegExp;
    typeName: string;
    category: PlateTypeCategory;
    alert: boolean;
}

const OMAN_PLATE_RULES: PlateRule[] = [
    { pattern: /^G\d+$/,    typeName: 'Government',        category: 'GOV', alert: true  },
    { pattern: /^D\d+$/,    typeName: 'Diwan',             category: 'DIW', alert: true  },
    { pattern: /^RC\d+$/,   typeName: 'Royal Court',       category: 'RC',  alert: true  },
    { pattern: /^CD\d+$/,   typeName: 'Diplomatic',        category: 'DIP', alert: true  },
    { pattern: /^M\d+$/,    typeName: 'Military',          category: 'MIL', alert: true  },
    { pattern: /^ROP\d+$/,  typeName: 'Royal Oman Police', category: 'ROP', alert: true  },
    { pattern: /^P\d+$/,    typeName: 'Police',            category: 'POL', alert: true  },
    { pattern: /^T\d+$/,    typeName: 'Taxi',              category: 'TAX', alert: false },
    { pattern: /^TR\d+$/,   typeName: 'Transport',         category: 'TRP', alert: false },
    { pattern: /^R\d+$/,    typeName: 'Rent-a-Car',        category: 'RNT', alert: false },
    { pattern: /^TMP\d+$/,  typeName: 'Temporary',         category: 'TMP', alert: false },
    { pattern: /^\d{1,5}$/, typeName: 'Private',           category: 'PVT', alert: false },
    { pattern: /^\d+[A-Z]$/,typeName: 'Private (Old)',     category: 'PVT', alert: false },
    { pattern: /^[A-Z]\d+$/,typeName: 'Private (Old)',     category: 'PVT', alert: false },
];

// Year range to treat as year plates (no vehicle, skip)
const YEAR_MIN = 2000;
const YEAR_MAX = 2040;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class OmanPlateClassifierService {
    /**
     * Full classification for one detected plate.
     *
     * Called by XmlParserService after XML parsing. All three sub-classifiers
     * (year filter, colour table, plate-number rules) run together so every
     * event in the DB has consistent enrichment.
     */
    classify(plateNumber: string, plateColorRaw?: string): OmanPlateClassification {
        const plate = (plateNumber ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
        const colorKey = (plateColorRaw ?? '').toLowerCase().trim();

        const isYearPlate = this.checkYearPlate(plate);

        const colorResult = this.resolveColor(colorKey);
        const typeResult = this.classifyByNumber(plate);

        // Merge alerts: colour alert OR plate-number alert
        const shouldAlert = colorResult.alert || typeResult.alert;
        const alertReasons: string[] = [];
        if (colorResult.alert && colorResult.note) {
            alertReasons.push(colorResult.note);
        }
        if (typeResult.alert) {
            alertReasons.push(`${typeResult.typeName} — verify authorization`);
        }
        if (isYearPlate) {
            alertReasons.push('Plate appears to be a year value — may be a misread');
        }

        // If colour already implies a type (EV), prefer it unless plate rule is
        // more specific (e.g. GOV prefix on an EV plate).
        let finalPlateType = typeResult.typeName;
        let finalPlateTypeCategory = typeResult.category;
        if (colorResult.ev && !typeResult.category.startsWith('GOV') && !typeResult.alert) {
            finalPlateType = colorResult.colorEntry?.note.split('—')[0].trim() ?? typeResult.typeName;
            finalPlateTypeCategory = typeResult.category;
        }

        return {
            plateType: finalPlateType,
            plateTypeCategory: finalPlateTypeCategory,
            plateColorCategory: colorResult.category,
            plateColorName: colorResult.colorName,
            isEV: colorResult.ev,
            shouldAlert,
            alertReason: alertReasons.length > 0 ? alertReasons.join('; ') : null,
            colorSource: colorResult.source,
            isYearPlate,
        };
    }

    /**
     * Returns true when the plate string looks like a 4-digit calendar year.
     * Used to skip year-label misreads (e.g. a "2026" painted on a surface).
     */
    isYearPlate(plateNumber: string): boolean {
        return this.checkYearPlate(
            (plateNumber ?? '').trim().toUpperCase().replace(/[\s-]/g, ''),
        );
    }

    private checkYearPlate(plate: string): boolean {
        if (!/^\d{4}$/.test(plate)) {
            return false;
        }
        const year = parseInt(plate, 10);
        return year >= YEAR_MIN && year <= YEAR_MAX;
    }

    private resolveColor(colorKey: string): {
        colorName: string;
        category: PlateColorCategory;
        ev: boolean;
        alert: boolean;
        note: string;
        source: 'xml' | 'none';
        colorEntry: ColorEntry | null;
    } {
        const entry = PLATE_COLOR_TABLE[colorKey];
        if (entry) {
            return {
                colorName: entry.colorName,
                category: entry.category,
                ev: entry.ev,
                alert: entry.alert,
                note: entry.note,
                source: 'xml',
                colorEntry: entry,
            };
        }
        return {
            colorName: colorKey || 'Unknown',
            category: 'UNK',
            ev: false,
            alert: false,
            note: '',
            source: 'none',
            colorEntry: null,
        };
    }

    private classifyByNumber(plate: string): {
        typeName: string;
        category: PlateTypeCategory;
        alert: boolean;
    } {
        if (!plate || plate === 'UNKNOWN') {
            return { typeName: 'Unknown', category: 'UNK', alert: false };
        }
        for (const rule of OMAN_PLATE_RULES) {
            if (rule.pattern.test(plate)) {
                return {
                    typeName: rule.typeName,
                    category: rule.category,
                    alert: rule.alert,
                };
            }
        }
        return {
            typeName: 'Unrecognized',
            category: 'UNK',
            alert: true,
        };
    }
}
