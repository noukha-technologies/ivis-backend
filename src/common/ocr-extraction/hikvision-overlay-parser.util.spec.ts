import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHikvisionOverlayFields,
  parseCaptureTimeLabel,
} from './hikvision-overlay-parser.util';

describe('parseHikvisionOverlayFields', () => {
  const SAMPLE =
    'Camera Info:C1 Device No.:C1 Capture Time:06-27-2026 09:34:22 ' +
    'Plate No.:5058R Vehicle Color:Red Vehicle Type:Van Vehicle Brand:GWM Haval ' +
    'Moving Direction:Forward Confidence:96% Camera No.:C1 Area/Country:OMN ' +
    'Plate Color:Yellow Plate Size:Long Plate Type:Private Province:unknown Category:R';

  it('extracts every field from the real camera overlay', () => {
    const f = parseHikvisionOverlayFields(SAMPLE);
    assert.strictEqual(f.plateNumber, '5058R');
    assert.strictEqual(f.captureTimeLabel, '06-27-2026 09:34:22');
    assert.strictEqual(f.confidence, 96);
    assert.strictEqual(f.vehicleColour, 'Red');
    assert.strictEqual(f.vehicleType, 'Van');
    assert.strictEqual(f.vehicleBrand, 'GWM Haval');
    assert.strictEqual(f.direction, 'Forward');
    assert.strictEqual(f.plateColour, 'Yellow');
    assert.strictEqual(f.plateSize, 'Long');
    assert.strictEqual(f.plateType, 'Private');
    // "unknown" is the camera saying it has no value — not a value.
    assert.strictEqual(f.province, undefined);
    assert.strictEqual(f.category, 'R');
  });

  it('recovers from common OCR garbling', () => {
    const garbled =
      'Plate No.:5058R Uehicle Brand:GWM Haval Confidence:96 x ' +
      'Plate 3ize:Lon q Plate Type:Private Category:R';
    const f = parseHikvisionOverlayFields(garbled);
    assert.strictEqual(f.plateNumber, '5058R');
    assert.strictEqual(f.vehicleBrand, 'GWM Haval');
    assert.strictEqual(f.confidence, 96);
    assert.strictEqual(f.plateSize, 'Long');
    assert.strictEqual(f.plateType, 'Private');
    assert.strictEqual(f.category, 'R');
  });

  /**
   * Verbatim OCR from examples/192.168.7.190_01_20260827103629771_OCR.txt —
   * a real frame with a wrapped timestamp, a split label ("Veh icle Brand"),
   * V→U and S→3 substitutions, and six fields the camera reported as unknown.
   */
  it('parses a real garbled frame exactly', () => {
    const real = `Camera Info:Cl1l Device No. :Cl Capture Time:08-27-2026 10:36:2
9 Plate No. unknown Uehicle Color :Red Vehicle Type:Sedan Veh
icle Brand:BMU Moving Direction:Forward Conf idence:0x Camera
No. : 1 Area~Country:NON Plate Color unknown Plate 3ize:unkn
oun Plate Type unknown Province unknown Category:`;
    const f = parseHikvisionOverlayFields(real);

    // Recovered despite the wrap and the substitutions.
    assert.strictEqual(f.captureTimeLabel, '08-27-2026 10:36:29');
    assert.strictEqual(f.vehicleColour, 'Red');
    assert.strictEqual(f.vehicleType, 'Sedan');
    assert.strictEqual(f.vehicleBrand, 'BMU');
    assert.strictEqual(f.direction, 'Forward');
    assert.strictEqual(f.confidence, 0);

    // Reported as unknown by the camera — absent, not the string "unknown".
    assert.strictEqual(f.plateNumber, undefined);
    assert.strictEqual(f.plateColour, undefined);
    assert.strictEqual(f.plateSize, undefined);
    assert.strictEqual(f.plateType, undefined);
    assert.strictEqual(f.province, undefined);
    assert.strictEqual(f.category, undefined);
  });

  it('canonicalises vehicle classes, including motorcycles', () => {
    const t = (raw: string) =>
      parseHikvisionOverlayFields(
        `Vehicle Type:${raw} Moving Direction:Forward`,
      ).vehicleType;
    assert.strictEqual(t('Motorcycle'), 'Motorcycle');
    assert.strictEqual(t('Motorbike'), 'Motorcycle');
    assert.strictEqual(t('Bus'), 'Bus');
    assert.strictEqual(t('Truck'), 'Truck');
    assert.strictEqual(t('Lorry'), 'Truck');
    assert.strictEqual(t('3edan'), 'Sedan');
    assert.strictEqual(t('unknown'), undefined);
  });

  it('returns only present fields when overlay is partial', () => {
    const f = parseHikvisionOverlayFields('Plate No.:1234AB Confidence:88%');
    assert.strictEqual(f.plateNumber, '1234AB');
    assert.strictEqual(f.confidence, 88);
    assert.strictEqual(f.vehicleBrand, undefined);
    assert.strictEqual(f.category, undefined);
  });
});

describe('parseCaptureTimeLabel', () => {
  it('parses MM-DD-YYYY HH:MM:SS with correct month/day order', () => {
    const dt = parseCaptureTimeLabel('06-27-2026 09:34:22');
    assert.notStrictEqual(dt, null);
    assert.strictEqual(dt!.getFullYear(), 2026);
    assert.strictEqual(dt!.getMonth(), 5); // June (0-indexed)
    assert.strictEqual(dt!.getDate(), 27);
    assert.strictEqual(dt!.getHours(), 9);
    assert.strictEqual(dt!.getMinutes(), 34);
    assert.strictEqual(dt!.getSeconds(), 22);
  });

  it('returns null for an unparseable label', () => {
    assert.strictEqual(parseCaptureTimeLabel('not-a-date'), null);
  });
});
