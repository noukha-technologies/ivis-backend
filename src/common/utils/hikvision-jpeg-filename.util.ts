import * as path from 'path';

export type HikvisionImageType =
  | 'VEHICLE_DETECTION'
  | 'VEHICLE_PICTURE'
  | 'VEHICLE_DETECTION_PLATE'
  | 'SCENE_CHANGE_DETECTION'
  | string;

export type HikvisionJpegFile = {
  ipAddress: string;
  channel: string;
  timestampKey: string;
  captureTime: Date;
  imageType: HikvisionImageType;
  fileName: string;
  eventKey: string;
};

const JPEG_FILENAME_RE =
  /^(\d+\.\d+\.\d+\.\d+)_(\d+)_(\d{16,17})(?:_(.+?))?\.jpe?g$/i;

export function parseHikvisionTimestampKey(timestampKey: string): Date | null {
  if (!/^\d{16,17}$/.test(timestampKey)) {
    return null;
  }
  const y = parseInt(timestampKey.slice(0, 4), 10);
  const mo = parseInt(timestampKey.slice(4, 6), 10) - 1;
  const d = parseInt(timestampKey.slice(6, 8), 10);
  const h = parseInt(timestampKey.slice(8, 10), 10);
  const mi = parseInt(timestampKey.slice(10, 12), 10);
  const s = parseInt(timestampKey.slice(12, 14), 10);
  let ms: number;
  if (timestampKey.length === 17) {
    ms = parseInt(timestampKey.slice(14, 17), 10);
  } else {
    ms = parseInt(timestampKey.slice(14, 16), 10) * 10;
  }
  const dt = new Date(y, mo, d, h, mi, s, ms);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function parseHikvisionJpegFilename(
  fileName: string,
): HikvisionJpegFile | null {
  const match = JPEG_FILENAME_RE.exec(fileName.trim());
  if (!match) {
    return null;
  }
  const [, ipAddress, channel, timestampKey, imageTypeRaw] = match;
  const captureTime = parseHikvisionTimestampKey(timestampKey);
  if (!captureTime) {
    return null;
  }
  const imageType = (imageTypeRaw?.trim() || 'SINGLE_CAPTURE').toUpperCase();
  return {
    ipAddress,
    channel,
    timestampKey,
    captureTime,
    imageType,
    fileName,
    eventKey: `${ipAddress}_${channel}_${timestampKey}`,
  };
}

export type JpegEventBundle = {
  eventKey: string;
  timestampKey: string;
  captureTime: Date;
  ipAddress: string;
  channel: string;
  vehicleDetectionPath: string | null;
  vehiclePicturePath: string | null;
  platePath: string | null;
  directoryPath: string;
};

export function groupJpegFilesIntoBundles(
  directoryPath: string,
  fileNames: string[],
): JpegEventBundle[] {
  const byKey = new Map<
    string,
    Partial<JpegEventBundle> & { eventKey: string }
  >();

  for (const name of fileNames) {
    const parsed = parseHikvisionJpegFilename(name);
    if (!parsed) {
      continue;
    }
    if (parsed.imageType === 'SCENE_CHANGE_DETECTION') {
      continue;
    }
    let bundle = byKey.get(parsed.eventKey);
    if (!bundle) {
      bundle = {
        eventKey: parsed.eventKey,
        timestampKey: parsed.timestampKey,
        captureTime: parsed.captureTime,
        ipAddress: parsed.ipAddress,
        channel: parsed.channel,
        vehicleDetectionPath: null,
        vehiclePicturePath: null,
        platePath: null,
        directoryPath,
      };
      byKey.set(parsed.eventKey, bundle);
    }
    const joined = path.join(directoryPath, name);
    switch (parsed.imageType) {
      case 'VEHICLE_DETECTION':
        bundle.vehicleDetectionPath = joined;
        break;
      case 'VEHICLE_PICTURE':
      case 'SINGLE_CAPTURE':
        bundle.vehiclePicturePath = joined;
        break;
      case 'VEHICLE_DETECTION_PLATE':
        bundle.platePath = joined;
        break;
      default:
        break;
    }
  }

  const bundles: JpegEventBundle[] = [];
  for (const b of byKey.values()) {
    // The DETECTION image carries the overlay strip, which is the whole of the
    // event's data — a bundle without it is three pictures and no reading. The
    // plate crop and the scene photograph are supplementary; on their own they
    // yield nothing to record.
    if (!b.vehicleDetectionPath) {
      continue;
    }
    bundles.push({
      eventKey: b.eventKey,
      timestampKey: b.timestampKey!,
      captureTime: b.captureTime!,
      ipAddress: b.ipAddress!,
      channel: b.channel!,
      vehicleDetectionPath: b.vehicleDetectionPath ?? null,
      vehiclePicturePath: b.vehiclePicturePath ?? null,
      platePath: b.platePath ?? null,
      directoryPath,
    });
  }

  return bundles.sort((a, b) => a.timestampKey.localeCompare(b.timestampKey));
}
