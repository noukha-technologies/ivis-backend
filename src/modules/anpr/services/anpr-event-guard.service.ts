import { Injectable, Logger } from '@nestjs/common';
import { AnprCaptureDao } from '../../database/dao/anpr-capture.dao';

export type AnprGuardRejectReason = 'invalid_plate' | 'duplicate_day';

export type AnprAcceptanceResult = {
    accept: boolean;
    reason?: AnprGuardRejectReason;
    existingCaptureId?: string;
    existingCaptureTime?: Date;
};

@Injectable()
export class AnprEventGuardService {
    private readonly logger = new Logger(AnprEventGuardService.name);
    private readonly dayTimezone: string;

    constructor(private readonly anprCaptureDao: AnprCaptureDao) {
        this.dayTimezone = process.env.ANPR_DAY_TIMEZONE?.trim() || 'Asia/Muscat';
    }

    isInvalidPlate(plate: string): boolean {
        const normalized = plate.trim().toUpperCase();
        if (!normalized) {
            return true;
        }
        if (normalized === 'UNKNOWN' || normalized === 'N/A' || normalized === 'NA') {
            return true;
        }
        if (normalized.length < 4) {
            return true;
        }
        if (!/[\p{L}\p{N}]/u.test(normalized)) {
            return true;
        }
        return false;
    }

    /** First capture already stored for this plate on the same calendar day. */
    async findExistingPlateOnDay(
        plate: string,
        captureTime: Date,
    ): Promise<{ id: string; capture_time: Date } | null> {
        const plateKey = plate.trim().toUpperCase();
        if (!plateKey || Number.isNaN(captureTime.getTime())) {
            return null;
        }

        return this.anprCaptureDao
            .createQueryBuilder('c')
            .where('c.is_deleted = false')
            .andWhere('UPPER(c.plate_number) = :plate', { plate: plateKey })
            .andWhere(
                `DATE(c.capture_time AT TIME ZONE :tz) = DATE(:captureTime AT TIME ZONE :tz)`,
                { tz: this.dayTimezone, captureTime },
            )
            .orderBy('c.capture_time', 'ASC')
            .select(['c.id', 'c.capture_time'])
            .getOne();
    }

    async shouldAcceptEvent(
        plate: string,
        captureTime: Date,
    ): Promise<AnprAcceptanceResult> {
        if (this.isInvalidPlate(plate)) {
            return { accept: false, reason: 'invalid_plate' };
        }

        const existing = await this.findExistingPlateOnDay(plate, captureTime);
        if (existing) {
            return {
                accept: false,
                reason: 'duplicate_day',
                existingCaptureId: existing.id,
                existingCaptureTime: existing.capture_time,
            };
        }

        return { accept: true };
    }

    logSkip(plate: string, result: AnprAcceptanceResult, context?: string): void {
        const prefix = context ? `[ANPR Guard] ${context}` : '[ANPR Guard]';
        if (result.reason === 'invalid_plate') {
            this.logger.log(`${prefix} Skipped invalid plate: ${plate}`);
            return;
        }
        if (result.reason === 'duplicate_day') {
            const at = result.existingCaptureTime?.toISOString() ?? 'unknown';
            this.logger.log(
                `${prefix} Skipped duplicate day: ${plate} (first seen capture=${result.existingCaptureId} at ${at})`,
            );
        }
    }
}
