import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';

import { CameraEntity } from '../../../database/entity/camera.entity';
import {
    getFtpIngestMode,
    joinCameraAndDateFolder,
    pickDateFolderNameFromCandidates,
    resolveActiveWatchPath,
    resolveCameraFolder,
    resolveDateFolderPath,
    shouldUseMountMode,
    stripCameraPathFromFtpRoot,
} from '../../../../common/utils/ftp-path-resolver.util';
import { joinFtpPath } from '../../../../common/utils/ftp-path.util';
import { groupJpegFilesIntoBundles } from '../../../../common/utils/hikvision-jpeg-filename.util';

import { FtpMethodService } from './ftp-method.service';
import { AnprGateway } from '../http-push-service/anpr-gateway.service';
import { FtpConnectionPoolService } from './ftp-connection-pool.service';
import { AnprWebhookService } from '../http-push-service/anpr-webhook.service';

import { ProcessedStrategy } from '../../../../common/enums/common.enums';
import { FtpCursor, FtpProcessResult } from '../../../../common/interfaces/common.interfaces';
import { ParsedAnprEvent } from '../../../../common/interfaces/anpr.interface';


@Injectable()
export class FtpFileProcessorService {
    private readonly logger = new Logger(FtpFileProcessorService.name);

    private readonly cursors = new Map<string, FtpCursor>();
    private readonly xmlCursors = new Map<string, string>();

    constructor(
        private readonly anprGateway: AnprGateway,
        private readonly ftpMethod: FtpMethodService,
        private readonly ftpPool: FtpConnectionPoolService,
        private readonly anprWebhookService: AnprWebhookService,
    ) { }

    getCursor(cameraId: string): string {
        const c = this.cursors.get(cameraId);
        return c ? `${c.dateFolder}|${c.timestampKey}` : '';
    }

    setCursor(cameraId: string, dateFolder: string, timestampKey: string): void {
        this.cursors.set(cameraId, { dateFolder, timestampKey });
    }

    clearCursor(cameraId: string): void {
        this.cursors.delete(cameraId);
        this.xmlCursors.delete(cameraId);
    }

    getProcessedStrategy(): ProcessedStrategy {
        const legacyDelete = process.env.ANPR_FTP_DELETE_PROCESSED_XML?.trim().toLowerCase();

        if (legacyDelete === '1' || legacyDelete === 'true' || legacyDelete === 'yes') {
            return ProcessedStrategy.DELETE;
        }
        const strategy = process.env.ANPR_FTP_PROCESSED_STRATEGY?.trim().toLowerCase();

        if (strategy === 'delete' || strategy === 'none' || strategy === 'move') {
            return strategy as ProcessedStrategy;
        }

        return ProcessedStrategy.MOVE;
    }

    resolveMountPath(camera: CameraEntity): string | null {
        return resolveActiveWatchPath(camera);
    }

    /** Resolve today's date folder path (ISO `2026-06-12` or legacy `2026_06_12-2026_06_12`). */
    async resolveWatchPath(camera: CameraEntity): Promise<string | null> {
        const root = camera.ftpDirectory?.trim();
        if (!root) {
            return null;
        }

        const normalizedRoot = stripCameraPathFromFtpRoot(
            root,
            camera.centreCode ?? '',
            camera.ipAddress,
        );
        const cameraFolder = resolveCameraFolder(
            normalizedRoot,
            camera.centreCode ?? '',
            camera.ipAddress,
        );

        if (shouldUseMountMode(camera)) {
            return resolveDateFolderPath(
                normalizedRoot,
                camera.centreCode ?? '',
                new Date(),
                camera.ipAddress,
            );
        }

        try {
            const listing = await this.ftpPool.listFiles(camera, cameraFolder);
            const dirNames = listing
                .filter((entry) => entry.type === 'd' && !entry.name.startsWith('.'))
                .map((entry) => entry.name);
            const dateFolder = pickDateFolderNameFromCandidates(dirNames);
            return joinCameraAndDateFolder(cameraFolder, dateFolder);
        } catch {
            return resolveDateFolderPath(
                normalizedRoot,
                camera.centreCode ?? '',
                new Date(),
                camera.ipAddress,
            );
        }
    }

    resolveCameraRoot(camera: CameraEntity): string | null {
        const root = camera.ftpDirectory?.trim();
        if (!root) {
            return null;
        }
        const mountBase = process.env.ANPR_FTP_MOUNT_BASE?.trim();
        const normalized = stripCameraPathFromFtpRoot(
            root,
            camera.centreCode ?? '',
            camera.ipAddress,
        );
        if (mountBase) {
            return path.join(mountBase, normalized.replace(/^[/\\]+/, ''));
        }
        return normalized;
    }

    async processNewFilesOnFtp(camera: CameraEntity): Promise<FtpProcessResult> {
        const watchPath = await this.resolveWatchPath(camera);
        if (!watchPath) {
            return { filesFound: 0, parsed: 0, saved: 0 };
        }

        const ingestMode = getFtpIngestMode();
        if (ingestMode === 'jpeg') {
            return { filesFound: 0, parsed: 0, saved: 0 };
        }

        const listing = await this.ftpPool.listFiles(camera, watchPath);
        const lastSeen = this.xmlCursors.get(camera.id) ?? '';

        const newFiles = listing
            .filter(
                (f) =>
                    f.type === '-' &&
                    !f.name.startsWith('.') &&
                    f.name.toLowerCase().endsWith('.xml') &&
                    f.name.localeCompare(lastSeen) > 0,
            )
            .sort((a, b) => a.name.localeCompare(b.name));

        return this.processXmlFileList(camera, watchPath, newFiles);
    }

    async processNewFilesOnMount(camera: CameraEntity): Promise<FtpProcessResult> {
        const watchPath = await this.resolveWatchPath(camera);
        if (!watchPath) {
            return { filesFound: 0, parsed: 0, saved: 0 };
        }

        try {
            await fs.promises.access(watchPath, fs.constants.R_OK);
        } catch {
            return { filesFound: 0, parsed: 0, saved: 0 };
        }

        const ingestMode = getFtpIngestMode();
        let names: string[];
        try {
            names = await fs.promises.readdir(watchPath);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Cannot read mount path ${watchPath}: ${msg}`);
        }

        if (ingestMode === 'xml') {
            const lastSeen = this.xmlCursors.get(camera.id) ?? '';
            const newFiles = names
                .filter(
                    (name) =>
                        !name.startsWith('.') &&
                        name.toLowerCase().endsWith('.xml') &&
                        name.localeCompare(lastSeen) > 0,
                )
                .sort((a, b) => a.localeCompare(b))
                .map((name) => ({ name, size: 0 }));
            return this.processXmlFileList(camera, watchPath, newFiles, 'mount');
        }

        if (ingestMode === 'auto') {
            const xmlFiles = names.filter((n) => n.toLowerCase().endsWith('.xml'));
            if (xmlFiles.length > 0) {
                const lastSeen = this.xmlCursors.get(camera.id) ?? '';
                const newFiles = xmlFiles
                    .filter((name) => name.localeCompare(lastSeen) > 0)
                    .sort((a, b) => a.localeCompare(b))
                    .map((name) => ({ name, size: 0 }));
                return this.processXmlFileList(camera, watchPath, newFiles, 'mount');
            }
        }

        return this.processJpegBundlesOnMount(camera, watchPath, names);
    }

    private async processJpegBundlesOnMount(
        camera: CameraEntity,
        watchPath: string,
        fileNames: string[],
    ): Promise<FtpProcessResult> {
        const dateFolder = path.basename(watchPath);
        const cursor = this.cursors.get(camera.id);
        if (cursor && cursor.dateFolder !== dateFolder) {
            this.cursors.set(camera.id, { dateFolder, timestampKey: '' });
        }

        const lastTimestamp =
            this.cursors.get(camera.id)?.dateFolder === dateFolder
                ? (this.cursors.get(camera.id)?.timestampKey ?? '')
                : '';

        const bundles = groupJpegFilesIntoBundles(watchPath, fileNames).filter(
            (b) => b.timestampKey.localeCompare(lastTimestamp) > 0,
        );

        if (bundles.length === 0) {
            return { filesFound: 0, parsed: 0, saved: 0 };
        }

        this.logger.log(
            `[FTP JPEG] ${camera.cameraCode}: ${bundles.length} new event bundle(s) in ${watchPath}`,
        );

        this.anprGateway.broadcastFtpActivity({
            cameraCode: camera.cameraCode,
            type: 'scan_start',
            message: `Found ${bundles.length} new JPEG event(s)`,
            xmlCount: bundles.length,
        });

        let parsed = 0;
        let saved = 0;

        for (const bundle of bundles) {
            try {
                const dto = await this.ftpMethod.buildEventFromJpegBundle(
                    camera,
                    bundle,
                );
                if (!dto) {
                    continue;
                }
                parsed += 1;
                const ok = await this.finalizeJpegBundle(camera, bundle, dto);
                if (ok) {
                    saved += 1;
                }
                this.setCursor(camera.id, dateFolder, bundle.timestampKey);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.error(
                    `[FTP JPEG] Failed bundle ${bundle.eventKey}: ${message}`,
                );
                this.anprGateway.broadcastFtpActivity({
                    cameraCode: camera.cameraCode,
                    type: 'file_error',
                    message,
                    fileName: bundle.eventKey,
                });
            }
        }

        this.anprGateway.broadcastFtpActivity({
            cameraCode: camera.cameraCode,
            type: 'scan_complete',
            message: `Parsed ${parsed}/${bundles.length}, new DB rows ${saved}`,
            xmlCount: bundles.length,
            savedCount: saved,
        });

        return { filesFound: bundles.length, parsed, saved };
    }

    private async finalizeJpegBundle(
        camera: CameraEntity,
        bundle: { eventKey: string; vehicleDetectionPath: string | null },
        dto: ParsedAnprEvent,
    ): Promise<boolean> {
        this.anprGateway.broadcastFtpActivity({
            cameraCode: camera.cameraCode,
            type: 'file_parsed',
            message: `Parsed plate ${dto.plateNumber}`,
            fileName: bundle.eventKey,
            plateNumber: dto.plateNumber,
        });

        const saved = await this.anprWebhookService.processEvent(dto);

        if (saved) {
            this.anprGateway.broadcastFtpActivity({
                cameraCode: camera.cameraCode,
                type: 'file_saved',
                message: `Saved event for ${dto.plateNumber}`,
                fileName: bundle.eventKey,
                plateNumber: dto.plateNumber,
            });
        }

        return saved;
    }

    private async processXmlFileList(
        camera: CameraEntity,
        dir: string,
        newFiles: Array<{ name: string; size?: number }>,
        source: 'ftp' | 'mount' = 'ftp',
    ): Promise<FtpProcessResult> {
        if (newFiles.length === 0) {
            return { filesFound: 0, parsed: 0, saved: 0 };
        }

        this.logger.log(
            `[FTP] ${camera.cameraCode}: ${newFiles.length} new XML file(s) (${source})`,
        );

        this.anprGateway.broadcastFtpActivity({
            cameraCode: camera.cameraCode,
            type: 'scan_start',
            message: `Found ${newFiles.length} new XML file(s)`,
            xmlCount: newFiles.length,
        });

        let parsed = 0;
        let saved = 0;

        for (const f of newFiles) {
            const handled =
                source === 'mount'
                    ? await this.processOneMountFile(camera, dir, f.name)
                    : await this.processOneFtpFile(
                        camera,
                        dir,
                        f.name,
                        typeof f.size === 'number' ? f.size : 0,
                    );

            if (handled.parsed) {
                parsed += 1;
            }
            if (handled.saved) {
                saved += 1;
            }
            this.xmlCursors.set(camera.id, f.name);
        }

        this.anprGateway.broadcastFtpActivity({
            cameraCode: camera.cameraCode,
            type: 'scan_complete',
            message: `Parsed ${parsed}/${newFiles.length}, new DB rows ${saved}`,
            xmlCount: newFiles.length,
            savedCount: saved,
        });

        return { filesFound: newFiles.length, parsed, saved };
    }

    private async processOneFtpFile(
        camera: CameraEntity,
        dir: string,
        fileName: string,
        fileSize: number,
    ): Promise<{ parsed: boolean; saved: boolean }> {
        const remoteXml = joinFtpPath(dir, fileName);

        try {
            this.anprGateway.broadcastFtpActivity({
                cameraCode: camera.cameraCode,
                type: 'file_found',
                message: `Processing ${fileName}`,
                fileName,
            });

            const dto = await this.ftpMethod.buildEventFromRemoteXml(
                camera,
                remoteXml,
                fileName,
                fileSize,
            );

            if (!dto) {
                return { parsed: false, saved: false };
            }

            return await this.finalizeFile(camera, dir, fileName, remoteXml, dto, 'ftp');
        } catch (err: unknown) {
            return this.handleFileError(camera, fileName, err);
        }
    }

    private async processOneMountFile(
        camera: CameraEntity,
        dir: string,
        fileName: string,
    ): Promise<{ parsed: boolean; saved: boolean }> {
        const localXml = path.join(dir, fileName);

        try {
            const stat = await fs.promises.stat(localXml);
            const dto = await this.ftpMethod.buildEventFromLocalXml(
                camera,
                localXml,
                fileName,
                stat.size,
            );

            if (!dto) {
                return { parsed: false, saved: false };
            }

            return await this.finalizeFile(
                camera,
                dir,
                fileName,
                localXml,
                dto,
                'mount',
            );
        } catch (err: unknown) {
            return this.handleFileError(camera, fileName, err);
        }
    }

    private async finalizeFile(
        camera: CameraEntity,
        dir: string,
        fileName: string,
        filePath: string,
        dto: ParsedAnprEvent,
        source: 'ftp' | 'mount',
    ): Promise<{ parsed: boolean; saved: boolean }> {
        this.anprGateway.broadcastFtpActivity({
            cameraCode: camera.cameraCode,
            type: 'file_parsed',
            message: `Parsed plate ${dto.plateNumber}`,
            fileName,
            plateNumber: dto.plateNumber,
        });

        const saved = await this.anprWebhookService.processEvent(dto);

        if (saved) {
            this.anprGateway.broadcastFtpActivity({
                cameraCode: camera.cameraCode,
                type: 'file_saved',
                message: `Saved event for ${dto.plateNumber}`,
                fileName,
                plateNumber: dto.plateNumber,
            });
        }

        if (source === 'ftp') {
            await this.postProcessFtpFile(camera, dir, filePath, fileName);
        } else {
            await this.postProcessMountFile(dir, filePath, fileName);
        }

        return { parsed: true, saved };
    }

    private handleFileError(
        camera: CameraEntity,
        fileName: string,
        err: unknown,
    ): { parsed: boolean; saved: boolean } {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
            `[FTP] Failed on file ${fileName} (${camera.cameraCode}): ${message}`,
        );
        this.anprGateway.broadcastFtpActivity({
            cameraCode: camera.cameraCode,
            type: 'file_error',
            message,
            fileName,
        });
        return { parsed: false, saved: false };
    }

    private async postProcessFtpFile(
        camera: CameraEntity,
        dir: string,
        remoteXml: string,
        fileName: string,
    ): Promise<void> {
        const strategy = this.getProcessedStrategy();
        if (strategy === 'none') {
            return;
        }

        if (strategy === 'delete') {
            try {
                await this.ftpPool.deleteFile(camera, remoteXml);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`[FTP] Could not delete ${remoteXml}: ${msg}`);
            }
            return;
        }

        const doneDir = joinFtpPath(dir, 'done');
        const donePath = joinFtpPath(doneDir, fileName);
        try {
            await this.ftpPool.ensureDirectory(camera, doneDir);
            await this.ftpPool.renameFile(camera, remoteXml, donePath);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`[FTP] Could not move ${remoteXml} to done/: ${msg}`);
        }
    }

    private async postProcessMountFile(
        dir: string,
        localXml: string,
        fileName: string,
    ): Promise<void> {
        const strategy = this.getProcessedStrategy();
        if (strategy === 'none') {
            return;
        }

        if (strategy === 'delete') {
            try {
                await fs.promises.unlink(localXml);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`[FTP Mount] Could not delete ${localXml}: ${msg}`);
            }
            return;
        }

        const doneDir = path.join(dir, 'done');
        const donePath = path.join(doneDir, fileName);
        try {
            await fs.promises.mkdir(doneDir, { recursive: true });
            await fs.promises.rename(localXml, donePath);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(
                `[FTP Mount] Could not move ${localXml} to done/: ${msg}`,
            );
        }
    }
}
