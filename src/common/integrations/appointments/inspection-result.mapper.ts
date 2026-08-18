import {
  BrakeResult,
  ExhaustResult,
  InspectionResultPayload,
  SlideSlipResult,
} from './appointment.types';

/**
 * Maps a parsed Admin PC OUT file onto the provider's INSPECTION_RESULT
 * payload.
 *
 * The two formats disagree about almost everything. The OUT file is a flat INI
 * of equipment readings keyed by rig section (`BRKSbr1`, `AGTTestResult`); the
 * provider wants a small nested object of named measurements. This module is
 * the whole of that translation, kept separate from the sender so the mapping
 * can be reasoned about — and corrected — without touching delivery.
 *
 * Guiding rule: every measurement field is optional to the provider, and the
 * payload is stored verbatim on their side. So a value we cannot read is
 * OMITTED, never sent as null or zero — a fabricated 0 reads as a real
 * measurement of zero on a customer's report.
 */

type IniSections = Record<string, Record<string, string>>;

/** Values the rigs use for "no reading" — all mean absent, not zero. */
const EMPTY_MARKERS = new Set(['', '-', '--', '---', '----', 'n/a', 'na']);

/**
 * Reads a numeric cell. Returns undefined for blanks and the dash markers, and
 * tolerates trailing junk the rigs append (`800#`, `14.0`), which parseFloat
 * handles but Number() would reject as NaN.
 */
function num(
  sections: IniSections,
  section: string,
  key: string,
): number | undefined {
  const raw = sections[section]?.[key]?.trim();
  if (raw === undefined || EMPTY_MARKERS.has(raw.toLowerCase())) {
    return undefined;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Reads a pass/fail cell, normalised to lowercase as the provider's examples show. */
function verdict(
  sections: IniSections,
  section: string,
  key: string,
): string | undefined {
  const raw = sections[section]?.[key]?.trim();
  if (!raw || EMPTY_MARKERS.has(raw.toLowerCase())) return undefined;
  return raw.toLowerCase();
}

function str(
  sections: IniSections,
  section: string,
  key: string,
): string | undefined {
  const raw = sections[section]?.[key]?.trim();
  if (!raw || EMPTY_MARKERS.has(raw.toLowerCase())) return undefined;
  return raw;
}

/** Drops undefined-valued keys, and the whole block if nothing survived. */
function compact<T extends object>(block: T): T | undefined {
  const entries = Object.entries(block).filter(([, v]) => v !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * Oman plates are digits-then-letters; the rigs write them with a hyphen
 * (`5328-VED`). The provider normalises separators itself, but doing it here
 * too keeps the stored payload identical to what matching will use.
 */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s\-/]/g, '').toUpperCase();
}

/** `25/12/2025` → `2025/12/2025`-style report date the provider echoes back. */
function inspectionDate(sections: IniSections): string | undefined {
  return str(sections, 'DateTime', 'Date');
}

/**
 * `08:23 am` → `08:23:00`. The provider documents HH:mm:ss; the rig writes a
 * 12-hour clock with a meridiem, so it is converted rather than passed through.
 */
function toSeconds(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(
    value.trim(),
  );
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = match[2];
  const second = match[3] ?? '00';
  const meridiem = match[4]?.toLowerCase();

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${minute}:${second}`;
}

/**
 * Exhaust gas — the AGT rig. CO and HC are the two the provider names; the
 * rest of the block (CO2, NO, lambda) has no field in their contract.
 */
function exhaust(sections: IniSections): ExhaustResult | undefined {
  return compact<ExhaustResult>({
    co_value: num(sections, 'AGTTestResult', 'CO'),
    hc_value: num(sections, 'AGTTestResult', 'HC'),
    result: verdict(sections, 'AGTTestResult', 'AGTTestResult'),
  });
}

/** Side slip — one track value per axle, plus the rig's own verdict. */
function slideSlip(sections: IniSections): SlideSlipResult | undefined {
  return compact<SlideSlipResult>({
    front_axle: num(sections, 'SSPfront', 'TrackValue'),
    rear_axle: num(sections, 'SSPrear', 'TrackValue'),
    result: verdict(sections, 'SSPTestResult', 'SSPgenResult'),
  });
}

/**
 * Brakes. `sb` is the service brake (BRKSbr<n>), `pb` the parking brake — which
 * the rig records as the HAND brake, BRKHbr<n>, on whichever axle carries it.
 * Axle 2 is the common case and the only one the sample file exercises, so
 * axle 1 is read too but simply stays absent when the rig did not test it.
 */
function brake(sections: IniSections): BrakeResult | undefined {
  return compact<BrakeResult>({
    axle1_sb_left: num(sections, 'BRKSbr1', 'MaxForceLe'),
    axle1_sb_right: num(sections, 'BRKSbr1', 'MaxForceRi'),
    axle2_sb_left: num(sections, 'BRKSbr2', 'MaxForceLe'),
    axle2_sb_right: num(sections, 'BRKSbr2', 'MaxForceRi'),
    axle1_pb_left: num(sections, 'BRKHbr1', 'MaxForceLe'),
    axle1_pb_right: num(sections, 'BRKHbr1', 'MaxForceRi'),
    axle2_pb_left: num(sections, 'BRKHbr2', 'MaxForceLe'),
    axle2_pb_right: num(sections, 'BRKHbr2', 'MaxForceRi'),
    sb_efficiency: num(sections, 'TestResult', 'DecelEmptySbr'),
    pb_efficiency: num(sections, 'TestResult', 'DecelEmptyHbr'),
    vehicle_weight_kg: num(sections, 'TestResult', 'WeightEmpty'),
    result: verdict(sections, 'BDETestResult', 'BDEgenResult'),
  });
}

export interface InspectionMapperInput {
  /** The parsed OUT file, as stored on Job.test_results. */
  sections: IniSections;
  /** IVIS's own verdict — the provider only cares pass vs not-pass. */
  overallResult: string | null | undefined;
  plateNumber: string;
  /** From the provider's own booking; omitting it risks an ambiguous match. */
  plateType?: string | null;
  /** The provider's lane id (L1), not the IVIS line id. */
  laneId?: string | null;
  jobNumber?: number | null;
}

/**
 * Builds the payload. `overall_result` is the only judgement made here:
 * APPROVED exclusively for a pass, because on their side anything else records
 * a failure and opens a 14-day free re-inspection — so an unknown or missing
 * verdict must never read as APPROVED.
 */
export function buildInspectionResultPayload(
  input: InspectionMapperInput,
): InspectionResultPayload {
  const { sections } = input;

  const payload: InspectionResultPayload = {
    plate_number: normalizePlate(input.plateNumber),
    overall_result: input.overallResult === 'Passed' ? 'APPROVED' : 'REJECTED',
  };

  if (input.plateType) payload.plate_type = input.plateType;
  if (input.laneId) payload.lane_id = input.laneId;
  if (typeof input.jobNumber === 'number') {
    payload.inspection_number = input.jobNumber;
  }

  const date = inspectionDate(sections);
  if (date) payload.inspection_date = date;

  const start = toSeconds(str(sections, 'DateTime', 'Time'));
  if (start) payload.start_time = start;

  const station = str(sections, 'GenCarInfo', 'InspectorName');
  if (station) payload.station_id = station;

  const exhaustBlock = exhaust(sections);
  if (exhaustBlock) payload.exhaust = exhaustBlock;

  const slideSlipBlock = slideSlip(sections);
  if (slideSlipBlock) payload.slide_slip = slideSlipBlock;

  const brakeBlock = brake(sections);
  if (brakeBlock) payload.brake = brakeBlock;

  // Deliberately not mapped: shock_absorber, light and visual_defects. The
  // rigs in this deployment produce no readings for them (HLT_Status is blank
  // in the sample), and IVIS holds no structured defect list at all — sending
  // empty blocks would assert a test was done that was not.
  const remarks = [
    str(sections, 'GenCarInfo', 'Remark1'),
    str(sections, 'GenCarInfo', 'Remark2'),
    str(sections, 'GenCarInfo', 'Remark3'),
  ].filter(Boolean);
  if (remarks.length > 0) payload.comments = remarks.join('; ');

  return payload;
}
