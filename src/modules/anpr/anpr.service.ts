import chalk from 'chalk';
import { Repository } from 'typeorm';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AnprEventEntity } from '../database/entity/anpr.entity';
import { UpdateAnprEventDto } from '../../common/dto/anpr-event.dto';
import { AnprWebhookService } from './services/http-push-service/anpr-webhook.service';

@Injectable()
export class AnprService {
    private readonly logger = new Logger(AnprService.name);

    constructor(
        @InjectRepository(AnprEventEntity)
        private readonly anprEventRepo: Repository<AnprEventEntity>,
        private readonly anprWebhookService: AnprWebhookService,
    ) { }

    async handleHikvisionWebhookPush(req: Request, res: Response): Promise<void> {
        const cameraCodeHint = await this.anprWebhookService.parseHikvisionWebhookCameraCode(req);

        void (async () => {
            let rawBody: Buffer;
            try {
                rawBody = await this.anprWebhookService.readRequestBody(req);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(
                    chalk.red(`[ANPR Controller] Failed to read webhook body: ${message}`),
                );
                if (!res.headersSent) {
                    res.status(400).end();
                }
                return;
            }

            // const capture = await this.anprWebhookService.saveRawWebhookCapture(req, rawBody, cameraCodeHint);
            // this.logger.log(
            //     chalk.cyan(
            //         `[ANPR Controller] Raw capture ${rawBody.length}B → ${capture.bodyPath}`,
            //     ),
            // );

            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Content-Length', '0');
            res.status(200).end();

            this.logger.log(
                chalk.green(
                    `[ANPR Controller] Webhook POST ${req.path} from ${req.ip} (cameraCode: ${cameraCodeHint ?? '(none)'})`,
                ),
            );

            await this.anprWebhookService.processIncomingEvent(req, rawBody, cameraCodeHint);
        })().catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(chalk.red(`[ANPR Controller] Async processing failed: ${message}`));
            if (!res.headersSent) {
                res.status(200).end();
            }
        });
    }

    async getRecentEvents(limit = 100, cameraCode?: string) {
        const query = this.anprEventRepo
            .createQueryBuilder('e')
            .orderBy('e.updatedAt', 'DESC', 'NULLS LAST')
            .addOrderBy('e.receivedAt', 'DESC')
            .addOrderBy('e.id', 'DESC')
            .take(limit);

        if (cameraCode) {
            query.where('e.cameraCode = :cameraCode', { cameraCode });
        }

        return query.getMany();
    }

    async getEventById(id: number): Promise<AnprEventEntity> {
        const event = await this.anprEventRepo.findOne({ where: { id } });
        if (!event) {
            throw new NotFoundException(`ANPR event not found: ${id}`);
        }
        return event;
    }

    async updateEvent(id: number, dto: UpdateAnprEventDto): Promise<AnprEventEntity> {
        const event = await this.getEventById(id);

        if (dto.plateNumber !== undefined) {
            event.plateNumber = dto.plateNumber.trim().toUpperCase();
        }
        if (dto.captureTime !== undefined) {
            event.captureTime = new Date(dto.captureTime);
        }
        if (dto.confidenceScore !== undefined) {
            event.confidenceScore = dto.confidenceScore;
        }
        if (dto.plateCharBelieve !== undefined) {
            event.plateCharBelieve = dto.plateCharBelieve;
        }
        if (dto.laneNumber !== undefined) {
            event.laneNumber = dto.laneNumber;
        }
        if (dto.vehicleType !== undefined) {
            event.vehicleType = dto.vehicleType;
        }
        if (dto.vehicleColour !== undefined) {
            event.vehicleColour = dto.vehicleColour;
        }
        if (dto.plateColour !== undefined) {
            event.plateColour = dto.plateColour;
        }
        if (dto.cameraCode !== undefined) {
            event.cameraCode = dto.cameraCode;
        }
        if (dto.centreCode !== undefined) {
            event.centreCode = dto.centreCode;
        }

        return this.anprEventRepo.save(event);
    }

    async deleteEvent(id: number): Promise<void> {
        const event = await this.getEventById(id);
        await this.anprEventRepo.remove(event);
    }

    async getEventStats(from: Date, to: Date, cameraCode?: string) {
        const query = this.anprEventRepo
            .createQueryBuilder('e')
            .where('e.captureTime BETWEEN :from AND :to', { from, to })
            .select('COUNT(*)', 'totalEvents')
            .addSelect('AVG(e.confidenceScore)', 'avgConfidence')
            .addSelect('MIN(e.confidenceScore)', 'minConfidence')
            .addSelect('e.cameraCode', 'cameraCode');

        if (cameraCode) {
            query.andWhere('e.cameraCode = :cameraCode', { cameraCode });
        }

        query.groupBy('e.cameraCode');

        return query.getRawMany();
    }
}