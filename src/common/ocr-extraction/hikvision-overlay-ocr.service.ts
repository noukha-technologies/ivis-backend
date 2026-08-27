import sharp from 'sharp';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import {
  HikvisionOverlayMetadata,
  PlateCropExtraction,
} from '../interfaces/anpr.interface';

import { normalizeOcrPlateNumber } from './oman-plate-normalizer.util';
import {
  parseCaptureTimeLabel,
  parseHikvisionOverlayFields,
} from './hikvision-overlay-parser.util';

/** Every character the overlay strip can contain. Nothing else is Latin text. */
const OVERLAY_WHITELIST =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .:,-/%';

/** How a single OCR pass should be run. */
type OcrProfile = {
  lang: string;
  psm?: PSM;
  /** Empty means no restriction. */
  whitelist?: string;
};

@Injectable()
export class HikvisionOverlayOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(HikvisionOverlayOcrService.name);

  private readonly minConfidence: number;

  /**
   * One worker per language, kept alive.
   *
   * Building a worker loads the trained data from disk, which costs far more
   * than the recognition itself — doing it per image made the FTP sweep spend
   * most of its time on setup. Recognitions are serialised through `queue`
   * because parameters live on the worker, so two overlapping passes with
   * different whitelists would read each other's settings.
   */
  private readonly workers = new Map<string, Promise<Worker>>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    const min = parseInt('80', 10);
    this.minConfidence = Number.isFinite(min) ? min : 80;
  }

  async onModuleDestroy(): Promise<void> {
    const pending = [...this.workers.values()];
    this.workers.clear();
    await Promise.all(
      pending.map((w) =>
        w.then((worker) => worker.terminate()).catch(() => undefined),
      ),
    );
  }

  async extractFromDetectionImage(
    imagePath: string,
  ): Promise<HikvisionOverlayMetadata | null> {
    try {
      const meta = await sharp(imagePath).metadata();
      const height = meta.height ?? 0;
      const width = meta.width ?? 0;
      if (height < 40 || width < 40) {
        return null;
      }

      const cropTop = Math.floor(height * 0.72);
      const cropHeight = height - cropTop;
      const strip = await sharp(imagePath)
        .extract({ left: 0, top: cropTop, width, height: cropHeight })
        .greyscale()
        .normalize()
        .png()
        .toBuffer();

      // The strip is Latin, laid out as one uniform block, drawn from a fixed
      // alphabet — say so, and Tesseract stops inventing alternatives. Loading
      // Arabic alongside English here was actively harmful: on a real capture
      // it read "Camera No.:C1" as an Arabic glyph and misread the timestamp
      // seconds, both of which came out right the moment `ara` was dropped.
      const text = await this.runOcr(strip, {
        lang: 'eng',
        psm: PSM.SINGLE_BLOCK,
        whitelist: OVERLAY_WHITELIST,
      });
      return this.parseOverlayText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[OCR] Detection overlay failed for ${imagePath}: ${msg}`,
      );
      return null;
    }
  }

  private async extractPlateFromCropFullDetailed(
    imagePath: string,
  ): Promise<PlateCropExtraction> {
    const prepped = await sharp(imagePath)
      .greyscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
    const text = await this.runOcr(prepped, {
      lang: 'eng',
      whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    });
    const cleaned = text
      .replace(/[^A-Za-z0-9؀-ۿ]/g, '')
      .trim()
      .toUpperCase();
    const normalized = normalizeOcrPlateNumber(cleaned);
    return {
      plate: normalized && normalized.length >= 3 ? normalized : null,
      rawDigitOcr: '',
      rawFullOcr: text,
      method: 'full_crop',
    };
  }

  async extractPlateFromCrop(imagePath: string): Promise<string | null> {
    const result = await this.extractPlateFromCropDetailed(imagePath);
    return result.plate;
  }

  async extractPlateFromCropDetailed(
    imagePath: string,
  ): Promise<PlateCropExtraction> {
    const empty: PlateCropExtraction = {
      plate: null,
      rawDigitOcr: '',
      method: 'digit_region',
    };
    try {
      const meta = await sharp(imagePath).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (width < 20 || height < 10) {
        return this.extractPlateFromCropFullDetailed(imagePath);
      }

      const digitRegionW = Math.max(20, Math.floor(width * 0.5));
      const digitRegion = await sharp(imagePath)
        .extract({ left: 0, top: 0, width: digitRegionW, height })
        .greyscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();

      const digitText = await this.runOcr(digitRegion, {
        lang: 'eng',
        whitelist: '0123456789',
      });
      const digits = digitText.replace(/\D/g, '');
      if (digits.length >= 3 && digits.length <= 5) {
        return {
          plate: digits,
          rawDigitOcr: digitText,
          method: 'digit_region',
        };
      }

      const full = await this.extractPlateFromCropFullDetailed(imagePath);
      return {
        ...full,
        rawDigitOcr: digitText,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[OCR] Plate crop failed for ${imagePath}: ${msg}`);
      return empty;
    }
  }

  async extractPlateFromSceneImage(
    imagePath: string,
  ): Promise<{ plateNumber?: string; confidence?: number } | null> {
    const detailed = await this.extractPlateFromSceneDetailed(imagePath);
    if (!detailed) {
      return null;
    }
    const { rawOcrText: _raw, ...rest } = detailed;
    return rest;
  }

  async extractPlateFromSceneDetailed(imagePath: string): Promise<{
    plateNumber?: string;
    confidence?: number;
    rawOcrText: string;
  } | null> {
    try {
      const meta = await sharp(imagePath).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (height < 80 || width < 80) {
        return null;
      }

      const cropW = Math.floor(width * 0.75);
      const cropH = Math.floor(height * 0.38);
      const left = Math.floor((width - cropW) / 2);
      const top = Math.floor(height * 0.42);

      const region = await sharp(imagePath)
        .extract({ left, top, width: cropW, height: cropH })
        .greyscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();

      // No whitelist and both scripts: a scene plate is read from the vehicle
      // itself, where the Arabic half of an Oman plate is really present.
      const text = await this.runOcr(region, { lang: 'eng+ara' });
      const parsed = this.parsePlateFromOcrText(text);
      return {
        ...parsed,
        rawOcrText: text,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[OCR] Scene plate failed for ${imagePath}: ${msg}`);
      return null;
    }
  }

  getMinConfidence(): number {
    return this.minConfidence;
  }

  private worker(lang: string): Promise<Worker> {
    const existing = this.workers.get(lang);
    if (existing) return existing;
    // A worker that failed to build must not stay cached as a rejection, or
    // every later pass in this language inherits the same failure.
    const created = createWorker(lang).catch((err: unknown) => {
      this.workers.delete(lang);
      throw err;
    });
    this.workers.set(lang, created);
    return created;
  }

  private runOcr(imageBuffer: Buffer, profile: OcrProfile): Promise<string> {
    const run = this.queue.then(async () => {
      const worker = await this.worker(profile.lang);
      // Set every parameter on every pass. They persist on the worker, so a
      // value left behind by the previous caller would silently apply here.
      await worker.setParameters({
        tessedit_pageseg_mode: profile.psm ?? PSM.AUTO,
        tessedit_char_whitelist: profile.whitelist ?? '',
        preserve_interword_spaces: '1',
      });
      const { data } = await worker.recognize(imageBuffer);
      return data.text ?? '';
    });
    // The chain must survive a failed pass, otherwise one bad image stops
    // every image queued behind it.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private normalizeOverlayPlate(
    parsed: ReturnType<typeof parseHikvisionOverlayFields>,
  ): string | undefined {
    return normalizeOcrPlateNumber(parsed.plateNumber, {
      category: parsed.category,
      plateSize: parsed.plateSize,
      plateColour: parsed.plateColour,
      plateType: parsed.plateType,
    });
  }

  parseOverlayText(text: string): HikvisionOverlayMetadata {
    const normalized = text.replace(/\r/g, '\n');
    const parsed = parseHikvisionOverlayFields(normalized);

    const result: HikvisionOverlayMetadata = {
      rawOcrText: normalized,
      plateNumber: this.normalizeOverlayPlate(parsed),
      confidence: parsed.confidence,
      vehicleType: parsed.vehicleType,
      vehicleColour: parsed.vehicleColour,
      vehicleBrand: parsed.vehicleBrand,
      direction: parsed.direction,
      plateColour: parsed.plateColour,
      plateSize: parsed.plateSize,
      plateType: parsed.plateType,
      province: parsed.province,
      category: parsed.category,
    };

    if (parsed.captureTimeLabel) {
      const captureTime = parseCaptureTimeLabel(parsed.captureTimeLabel);
      if (captureTime) {
        result.captureTime = captureTime;
      }
    }

    return result;
  }

  parsePlateFromOcrText(text: string): {
    plateNumber?: string;
    confidence?: number;
  } {
    const normalized = text.replace(/\r/g, '\n').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return {};
    }

    const overlay = parseHikvisionOverlayFields(normalized);
    const overlayPlate = normalizeOcrPlateNumber(overlay.plateNumber, {
      category: overlay.category,
      plateSize: overlay.plateSize,
      plateColour: overlay.plateColour,
      plateType: overlay.plateType,
    });
    if (overlayPlate) {
      return {
        plateNumber: overlayPlate,
        confidence: overlay.confidence ?? 85,
      };
    }

    const latinDigits =
      normalized.match(/\b([A-Z]{1,3})\s*(\d{3,6})\b/i) ??
      normalized.match(/\b(\d{3,6})\b/);
    if (latinDigits) {
      const plate = (latinDigits[1] + (latinDigits[2] ?? ''))
        .replace(/\s+/g, '')
        .toUpperCase();
      if (plate.length >= 3) {
        return { plateNumber: plate, confidence: 88 };
      }
    }

    const cleaned = normalized
      .replace(/[^A-Za-z0-9؀-ۿ]/g, '')
      .trim()
      .toUpperCase();
    const normalizedPlate = normalizeOcrPlateNumber(cleaned);
    if (normalizedPlate && normalizedPlate.length >= 3) {
      return { plateNumber: normalizedPlate, confidence: 82 };
    }

    return {};
  }
}
