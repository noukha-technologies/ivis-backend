import chalk from 'chalk';
import { Request, Response } from 'express';
import { Injectable, Logger } from '@nestjs/common';
import { AnprWebhookService } from './services/http-push-service/anpr-webhook.service';

@Injectable()
export class AnprService {
    private readonly logger = new Logger(AnprService.name);

    constructor(private readonly anprWebhookService: AnprWebhookService) { }

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
}
