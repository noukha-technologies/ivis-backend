import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnprEventEntity } from '../../database/entity/anpr.entity';

export type AnprGuardRejectReason = 'invalid_plate' | 'duplicate_day';

export type AnprAcceptanceResult = {
    accept: boolean;
    reason?: AnprGuardRejectReason;
    existingEventId?: number;
    existingCaptureTime?: Date;
};

@Injectable()
export class AnprEventGuardService {
    private readonly logger = new Logger(AnprEventGuardService.name);
    private readonly dayTimezone: string;

    constructor(
        @InjectRepository(AnprEventEntity)
        private readonly anprEventRepo: Repository<AnprEventEntity>,
    ) {
        this.dayTimezone =
            process.env.ANPR_DAY_TIMEZONE?.trim() || 'Asia/Muscat';
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

    async findExistingPlateOnDay(
        plate: string,
        captureTime: Date,
    ): Promise<AnprEventEntity | null> {
        const plateKey = plate.trim().toUpperCase();
        if (!plateKey || Number.isNaN(captureTime.getTime())) {
            return null;
        }

        return this.anprEventRepo
            .createQueryBuilder('e')
            .where('UPPER(e.plate_number) = :plate', { plate: plateKey })
            .andWhere(
                `DATE(e.capture_time AT TIME ZONE :tz) = DATE(:captureTime AT TIME ZONE :tz)`,
                { tz: this.dayTimezone, captureTime },
            )
            .orderBy('e.capture_time', 'ASC')
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
                existingEventId: existing.id,
                existingCaptureTime: existing.captureTime,
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
                `${prefix} Skipped duplicate day: ${plate} (first seen id=${result.existingEventId} at ${at})`,
            );
        }
    }
}
