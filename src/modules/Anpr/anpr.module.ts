import { TypeOrmModule } from '@nestjs/typeorm';
import { Module, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { AnprController } from './anpr.controller';
import { AnprService } from './anpr.service';

import { Camera } from '../database/entity/camera.entity';
import { AnprEventEntity } from '../database/entity/anpr.entity';

import { AnprGateway } from './services/http-push-service/anpr-gateway.service';
// Shared services
import { MultipartParserService } from '../../common/shared/anpr/multipart-parser.service';
import { XmlParserService } from '../../common/shared/anpr/xml-parser.service';
import { ImageProcessorService } from '../../common/shared/anpr/image-processor.service';
import { RawFileResponseBuilder } from '../../common/shared/anpr/raw-file-response.builder.service';
import { OmanPlateClassifierService } from '../../common/shared/anpr/oman-plate-classifier.service';

// Camera config service
import { AnprMethodConfigService } from './services/anpr-method-config.service';
import { FtpMethodService } from './services/ftp-service/ftp-method.service';
import { FtpFileProcessorService } from './services/ftp-service/ftp-file-processor.service';
import { FtpFolderWatcherService } from './services/ftp-service/ftp-folder-watcher.service';
import { FtpDirectoryScannerService } from './services/ftp-service/ftp-directory-scanner.service';
import { AnprWebhookService } from './services/http-push-service/anpr-webhook.service';
import { FtpConnectionPoolService } from './services/ftp-service/ftp-connection-pool.service';
import { HikvisionOverlayOcrService } from './services/ftp-service/hikvision-overlay-ocr.service';
import { AnprEventGuardService } from './services/anpr-event-guard.service';
import { AnprCaptureModule } from '../transactions/anpr-captures/anpr-capture.module';

/**
 * ═══════════════════════════════════════════════════════════════════
 * ANPR MODULE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Main module that wires all ANPR-related services.
 *
 * Provides:
 * - HTTP endpoint for camera webhook (HTTP push)
 * - WebSocket gateway for real-time broadcast
 * - Core ANPR processing logic
 * - Integration-specific services (HTTP push / FTP)
 * - Shared utilities (parser, image, etc.)
 *
 * On module init:
 * - Validates camera configurations
 * - Starts FTP watchers
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([AnprEventEntity, Camera]),
        AnprCaptureModule,
    ],
    controllers: [AnprController],
    providers: [
        // ─── Core Services ───────────────────────────────────────
        AnprService,
        AnprGateway,

        // ─── Shared Utilities ────────────────────────────────────
        MultipartParserService,
        OmanPlateClassifierService,
        XmlParserService,
        ImageProcessorService,
        RawFileResponseBuilder,

        // ─── Camera Config ───────────────────────────────────────
        AnprMethodConfigService,

        // ─── FTP folder watch + fallback sweep ───────────
        FtpConnectionPoolService,
        FtpMethodService,
        FtpFileProcessorService,
        FtpFolderWatcherService,
        FtpDirectoryScannerService,
        HikvisionOverlayOcrService,
        AnprEventGuardService,

        // ─── Helpers ──────────────────────────────────────────────
        AnprWebhookService,
        // Bridge — AnprCaptureService is exported by AnprCaptureModule above
    ],
    exports: [AnprService, AnprGateway, FtpFolderWatcherService],
})
export class AnprModule implements OnApplicationBootstrap {
    private readonly logger = new Logger(AnprModule.name);

    constructor(
        private readonly methodConfig: AnprMethodConfigService,
        private readonly ftpFolderWatcher: FtpFolderWatcherService,
    ) { }

    /**
     * Runs after NestJS and the database connection are fully ready.
     */
    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('[ANPR Module] Initializing...');

        try {
            await this.methodConfig.validateAllCameras();
            await this.ftpFolderWatcher.bootstrapOnStartup();

            this.logger.log('[ANPR Module] ✓ Module initialized successfully');
            this.logger.log(
                '[ANPR Module] HTTP push: POST .../anpr/push/webhook (alias .../anpr/anpr)',
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[ANPR Module] Initialization failed: ${message}`);
            throw error;
        }
    }
}