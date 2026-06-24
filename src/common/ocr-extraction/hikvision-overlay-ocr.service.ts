import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import {
    parseCaptureTimeLabel,
    parseHikvisionOverlayFields,
} from './hikvision-overlay-parser.util';
import { normalizeOcrPlateNumber } from './oman-plate-normalizer.util';

export type HikvisionOverlayMetadata = {
    plateNumber?: string;
    confidence?: number;
    captureTime?: Date;
    vehicleType?: string;
    vehicleColour?: string;
    vehicleBrand?: string;
    direction?: string;
    plateColour?: string;
    plateSize?: string;
    plateType?: string;
    province?: string;
    category?: string;
    rawOcrText: string;
};

export type PlateCropExtraction = {
    plate: string | null;
    rawDigitOcr: string;
    rawFullOcr?: string;
    method: 'digit_region' | 'full_crop';
};

@Injectable()
export class HikvisionOverlayOcrService {
    private readonly logger = new Logger(HikvisionOverlayOcrService.name);
    private readonly ocrLang: string;
    private readonly minConfidence: number;

    constructor() {
        this.ocrLang = process.env.ANPR_FTP_OCR_LANG?.trim() || 'eng+ara';
        const min = parseInt(process.env.ANPR_FTP_MIN_CONFIDENCE ?? '80', 10);
        this.minConfidence = Number.isFinite(min) ? min : 80;
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

            const text = await this.runOcr(strip);
            return this.parseOverlayText(text);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`[OCR] Detection overlay failed for ${imagePath}: ${msg}`);
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
        const text = await this.runOcr(
            prepped,
            '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        );
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

            const digitText = await this.runOcr(digitRegion, '0123456789');
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

    async extractPlateFromSceneDetailed(
        imagePath: string,
    ): Promise<{ plateNumber?: string; confidence?: number; rawOcrText: string } | null> {
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

            const text = await this.runOcr(region);
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

    private async runOcr(imageBuffer: Buffer, whitelist?: string): Promise<string> {
        const worker = await createWorker(this.ocrLang);
        try {
            if (whitelist) {
                await worker.setParameters({
                    tessedit_char_whitelist: whitelist,
                });
            }
            const { data } = await worker.recognize(imageBuffer);
            return data.text ?? '';
        } finally {
            await worker.terminate();
        }
    }

    private normalizeOverlayPlate(parsed: ReturnType<typeof parseHikvisionOverlayFields>): string | undefined {
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

    parsePlateFromOcrText(text: string): { plateNumber?: string; confidence?: number } {
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
