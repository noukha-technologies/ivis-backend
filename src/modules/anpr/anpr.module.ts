import { TypeOrmModule } from '@nestjs/typeorm';
import { Module, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { AnprCaptureModule } from '../transactions/anpr-captures/anpr-capture.module';

import { AnprController } from './anpr.controller';
import { AnprService } from './anpr.service';

import { Camera } from '../database/entity/camera.entity';

// Shared services
import { XmlParserService } from '../../common/shared/anpr/xml-parser.service';
import { ImageProcessorService } from '../../common/shared/anpr/image-processor.service';
import { MultipartParserService } from '../../common/shared/anpr/multipart-parser.service';
import { RawFileResponseBuilder } from '../../common/shared/anpr/raw-file-response.builder.service';
import { OmanPlateClassifierService } from '../../common/shared/anpr/oman-plate-classifier.service';
import { HikvisionOverlayOcrService } from '../../common/ocr-extraction/hikvision-overlay-ocr.service';

// Camera config service
import { AnprEventGuardService } from './services/anpr-event-guard.service';
import { FtpMethodService } from './services/ftp-service/ftp-method.service';
import { AnprMethodConfigService } from './services/anpr-method-config.service';
import { AnprGateway } from './services/http-push-service/anpr-gateway.service';
import { AnprWebhookService } from './services/http-push-service/anpr-webhook.service';
import { FtpFolderWatcherService } from './services/ftp-service/ftp-folder-watcher.service';
import { FtpFileProcessorService } from './services/ftp-service/ftp-file-processor.service';
import { FtpConnectionPoolService } from './services/ftp-service/ftp-connection-pool.service';
import { FtpDirectoryScannerService } from './services/ftp-service/ftp-directory-scanner.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([Camera]),
        AnprCaptureModule,
        DatabaseModule
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
    ],
    exports: [AnprService, AnprGateway, FtpFolderWatcherService],
})
export class AnprModule implements OnApplicationBootstrap {
    private readonly logger = new Logger(AnprModule.name);

    constructor(
        private readonly methodConfig: AnprMethodConfigService,
        private readonly ftpFolderWatcher: FtpFolderWatcherService,
    ) { }

    async onApplicationBootstrap(): Promise<void> {
        this.logger.log('━━━ ANPR Module Bootstrap ━━━');

        try {
            this.logger.log('→ Validating camera configurations...');
            await this.methodConfig.validateAllCameras();
            this.logger.log('✓ Camera configurations validated');

            this.logger.log('→ Starting FTP folder watchers...');
            await this.ftpFolderWatcher.bootstrapOnStartup();
            this.logger.log('✓ FTP watchers are listening');

            this.logger.log('━━━ ANPR Module Ready ━━━');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`✗ ANPR Module bootstrap failed: ${message}`);
            throw error;
        }
    }
}