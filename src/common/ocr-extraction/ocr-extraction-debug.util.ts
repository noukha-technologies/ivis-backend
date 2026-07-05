import * as fs from 'fs';
import * as path from 'path';

export type OcrCandidateDebug = {
  source: string;
  raw?: string | null;
  normalized?: string | null;
};

export type JpegOcrExtractionDebug = {
  eventKey: string;
  writtenAt: string;
  cameraCode?: string;
  files: { detection?: string; plate?: string; picture?: string };
  detectionOverlay?: {
    rawOcrText: string;
    parsedPlate?: string | null;
    parsedCategory?: string | null;
    parsedPlateSize?: string | null;
    parsedConfidence?: number | null;
    parsedFields: Record<string, string | number | null | undefined>;
  };
  plateCrop?: {
    rawDigitOcr: string;
    rawFullOcr?: string;
    normalizedPlate?: string | null;
    method: 'digit_region' | 'full_crop';
  };
  scene?: { rawOcrText: string; normalizedPlate?: string | null };
  selection?: {
    chosenPlate?: string;
    source?: string;
    candidates: OcrCandidateDebug[];
  };
  notes?: string[];
};

function isOcrDebugEnabled(): boolean {
  const flag = process.env.ANPR_FTP_OCR_DEBUG?.trim().toLowerCase();
  return flag !== '0' && flag !== 'false' && flag !== 'no';
}

function formatSection(title: string, lines: string[]): string {
  return [`=== ${title} ===`, ...lines, ''].join('\n');
}

export function formatOcrExtractionDebug(
  report: JpegOcrExtractionDebug,
): string {
  const lines: string[] = [
    'IVIS ANPR — OCR extraction debug',
    `Event key: ${report.eventKey}`,
    `Camera: ${report.cameraCode ?? '—'}`,
    `Written at: ${report.writtenAt}`,
    '',
    formatSection('Source files', [
      `Detection: ${report.files.detection ?? '—'}`,
      `Plate crop: ${report.files.plate ?? '—'}`,
      `Scene: ${report.files.picture ?? '—'}`,
    ]),
  ];
  if (report.detectionOverlay) {
    lines.push(
      formatSection('Detection image — overlay strip OCR (raw)', [
        report.detectionOverlay.rawOcrText || '(empty)',
      ]),
      formatSection('Detection image — parsed overlay fields', [
        ...Object.entries(report.detectionOverlay.parsedFields).map(
          ([k, v]) => `${k}: ${v ?? '—'}`,
        ),
      ]),
    );
  }
  if (report.plateCrop) {
    lines.push(
      formatSection('Plate crop — digit region OCR (raw)', [
        report.plateCrop.rawDigitOcr || '(empty)',
      ]),
    );
    if (report.plateCrop.rawFullOcr !== undefined) {
      lines.push(
        formatSection('Plate crop — full image OCR (raw)', [
          report.plateCrop.rawFullOcr || '(empty)',
        ]),
      );
    }
    lines.push(
      formatSection('Plate crop — normalized', [
        `method: ${report.plateCrop.method}`,
        `plate: ${report.plateCrop.normalizedPlate ?? '—'}`,
      ]),
    );
  }
  if (report.scene) {
    lines.push(
      formatSection('Scene image — OCR (raw)', [
        report.scene.rawOcrText || '(empty)',
      ]),
      formatSection('Scene image — normalized plate', [
        report.scene.normalizedPlate ?? '—',
      ]),
    );
  }
  if (report.selection) {
    lines.push(
      formatSection('Final plate selection', [
        `chosen: ${report.selection.chosenPlate ?? '—'}`,
        `source: ${report.selection.source ?? '—'}`,
        ...report.selection.candidates.map(
          (c) =>
            `- ${c.source}: raw="${c.raw ?? ''}" normalized="${c.normalized ?? ''}"`,
        ),
      ]),
    );
  }
  if (report.notes?.length) {
    lines.push(formatSection('Notes', report.notes));
  }
  return lines.join('\n');
}

export function writeOcrExtractionDebugFile(
  anchorImagePath: string,
  report: JpegOcrExtractionDebug,
): string | null {
  if (!isOcrDebugEnabled()) return null;
  const dir = path.dirname(anchorImagePath);
  const txtPath = path.join(dir, `${report.eventKey}_OCR.txt`);
  const body = formatOcrExtractionDebug(report);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(txtPath, body, 'utf8');
    return txtPath;
  } catch {
    return null;
  }
}
