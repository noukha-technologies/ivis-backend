import * as fs from "fs";
import chalk from "chalk";
import * as path from "path";
import { Request } from "express";
import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";

import { WebhookResolveReason } from "../../../../common/enums/common.enums";
import { CameraIntegrationMethod } from "../../../../common/enums/camera.enums";

import { CameraEntity } from "../../../database/entity/camera.entity";
import { AnprEventEntity } from "../../../database/entity/anpr.entity";

import { MultipartParserService } from "../../../../common/shared/anpr/multipart-parser.service";
import { RawFileResponseBuilder } from "../../../../common/shared/anpr/raw-file-response.builder.service";
import { XmlParserService } from "../../../../common/shared/anpr/xml-parser.service";
import { ImageProcessorService } from "../../../../common/shared/anpr/image-processor.service";
import { AnprRawMultipartInterface, ParsedAnprEvent, WebhookRawCapture } from "../../../../common/interfaces/anpr.interface";
import { AnprGateway } from "./anpr-gateway.service";
import { AnprEventGuardService } from "../anpr-event-guard.service";
import { AnprMethodConfigService } from "../anpr-method-config.service";
import { AnprCaptureService } from "../../../transactions/anpr-captures/services/anpr-capture.service";

@Injectable()
export class AnprWebhookService {
    private readonly logger = new Logger(AnprWebhookService.name);

    constructor(
        @InjectRepository(CameraEntity)
        private readonly cameraRepo: Repository<CameraEntity>,
        @InjectRepository(AnprEventEntity)
        private readonly anprEventRepo: Repository<AnprEventEntity>,

        private readonly anprGateway: AnprGateway,
        private readonly xmlParser: XmlParserService,
        private readonly imageProcessor: ImageProcessorService,
        private readonly multipartParser: MultipartParserService,
        private readonly rawFileResponseBuilder: RawFileResponseBuilder,
        private readonly eventGuard: AnprEventGuardService,
        private readonly methodConfig: AnprMethodConfigService,
        private readonly anprCaptureService: AnprCaptureService,
    ) { }

    private assertHttpPushCamera(camera: CameraEntity, context: string): void {
        if (!this.methodConfig.acceptsInbound(camera, CameraIntegrationMethod.PUSH)) {
            throw new BadRequestException(
                `Camera ${camera.cameraCode} is registered for ${this.methodConfig.configuredMethod(camera)}; ` +
                `${context} is not accepted`,
            );
        }
    }

    private filterHttpPushCameras(cameras: CameraEntity[]): CameraEntity[] {
        return cameras.filter((c) =>
            this.methodConfig.acceptsInbound(c, CameraIntegrationMethod.PUSH),
        );
    }

    public async readRequestBody(req: Request): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
        });
    }

    private getWebhookRawCaptureDir(): string {
        const explicit = process.env.ANPR_RAW_CAPTURE_DIR?.trim();
        if (explicit) {
            return path.resolve(explicit);
        }
        return path.resolve(process.cwd(), 'logs', 'anpr-webhook-raw');
    }

    private parseAliasMap(): Map<string, string> {
        const map = new Map<string, string>();
        const raw = process.env.ANPR_WEBHOOK_ALIASES?.trim();
        if (!raw) {
            return map;
        }
        for (const part of raw.split(',')) {
            const segment = part.trim();
            if (!segment) {
                continue;
            }
            const eq = segment.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            const from = segment.slice(0, eq).trim();
            const to = segment.slice(eq + 1).trim();
            if (from && to) {
                map.set(from, to);
            }
        }
        return map;
    }

    private logWebhookResolution(identifier: string, camera: CameraEntity, reason: WebhookResolveReason): void {
        if (identifier === camera.cameraCode && reason === 'camera_code') {
            this.logger.log(`[ANPR Service] Webhook resolved ${camera.cameraCode} (${reason})`);
            return;
        }
        this.logger.log(`[ANPR Service] Webhook resolved identifier "${identifier}" → camera ${camera.cameraCode} (centre ${camera.centreCode}, ${reason})`);
    }

    private getRequestIpVariants(req: Request): string[] {
        const raw = (req.ip || req.socket?.remoteAddress || '').trim();
        if (!raw) {
            return [];
        }
        const normalized = raw.replace(/^::ffff:/i, '');
        return [...new Set([raw, normalized].filter(Boolean))];
    }

    private disambiguateCamerasByRequestIp(cameras: CameraEntity[], req: Request, context: string): CameraEntity | null {
        if (cameras.length === 0) {
            return null;
        }
        if (cameras.length === 1) {
            return cameras[0];
        }

        const ips = this.getRequestIpVariants(req);
        if (ips.length === 0) {
            throw new BadRequestException(`Multiple cameras match ${context}; could not disambiguate without request IP`);
        }

        const matched = cameras.filter((c) => {
            const camIp = c.ipAddress?.trim() ?? '';
            return ips.some((ip) => ip === camIp || ip.replace(/^::ffff:/i, '') === camIp);
        });

        if (matched.length === 1) {
            return matched[0];
        }

        const codes = cameras.map((c) => c.cameraCode).join(', ');
        throw new BadRequestException(`Multiple cameras match ${context} (${codes}); disambiguate with a unique cameraCode or IP`);
    }

    private async resolveCameraFromRequestIp(
        req: Request,
    ): Promise<CameraEntity | null> {
        const variants = this.getRequestIpVariants(req);
        if (variants.length === 0) {
            return null;
        }
        const rows = await this.cameraRepo.find({
            where: variants.map((ip) => ({ ip_address: ip, status: 'Active', is_deleted: false })),
        });
        const byId = new Map<string, CameraEntity>();
        for (const r of rows) {
            byId.set(r.id, r);
        }
        const list = this.filterHttpPushCameras(
            [...byId.values()].filter((c) => c.isActive),
        );
        if (list.length === 0) {
            return null;
        }
        return this.disambiguateCamerasByRequestIp(
            list,
            req,
            `IP ${variants[0]} (HTTP push)`,
        );
    }

    /**
    * Apply confidence filter
    * Skip plates below threshold
    *
    * @param eventDto - Parsed event
    * @param threshold - Minimum confidence (default 80)
    * @returns true if event passes filter
    */
    private passesConfidenceFilter(eventDto: ParsedAnprEvent, threshold = 80): boolean {
        if (eventDto.confidenceScore < threshold) {
            this.logger.debug(
                `[HTTP Push] Filtered: plate ${eventDto.plateNumber} confidence ${eventDto.confidenceScore}% < ${threshold}%`,
            );
            return false;
        }
        return true;
    }


    /**
     * Optional debug: set ANPR_DEBUG_DUMP_DIR to a folder path.
     * Writes anpr.xml + images + meta.json per webhook (after multipart parse).
     */
    private dumpHikvisionWebhookPayload(req: Request, cameraCode: string, payload: AnprRawMultipartInterface): void {
        const dir = process.env.ANPR_DEBUG_DUMP_DIR?.trim();
        if (!dir) {
            return;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const folder = path.join(dir, `${stamp}_${cameraCode.replace(/[^\w-]/g, '_')}`);
        fs.mkdirSync(folder, { recursive: true });

        fs.writeFileSync(path.join(folder, 'anpr.xml'), payload.xmlBuffer);
        for (const [name, buffer] of Object.entries(payload.files)) {
            const safeName = name.replace(/[^\w.-]/g, '_');
            fs.writeFileSync(path.join(folder, safeName), buffer);
        }

        const meta = {
            cameraCode,
            requestIp: req.ip,
            query: req.query,
            headers: {
                contentType: req.get('content-type'),
                contentLength: req.get('content-length'),
            },
            xmlSize: payload.xmlBuffer.length,
            files: Object.fromEntries(
                Object.entries(payload.files).map(([k, v]) => [k, v.length]),
            ),
            receivedAt: payload.meta?.receivedAt?.toISOString() ?? new Date().toISOString(),
        };
        fs.writeFileSync(path.join(folder, 'meta.json'), JSON.stringify(meta, null, 2));
    }

    /** Resolves Hikvision `cameraCode` query (camera code, centre code, alias, or IP). */
    private async resolveCameraForWebhook(identifier: string | null, req: Request): Promise<CameraEntity> {
        const trimmed = identifier?.trim() ?? '';
        const aliasMap = this.parseAliasMap();

        if (trimmed) {
            const aliasTarget = aliasMap.get(trimmed.trim()) ?? null;
            if (aliasTarget) {
                const byAlias = await this.cameraRepo.findOne({
                    where: {
                        code: aliasTarget,
                        status: 'Active',
                        is_deleted: false,
                    },
                });
                if (byAlias) {
                    this.assertHttpPushCamera(byAlias, 'HTTP push webhook (alias)');
                    this.logWebhookResolution(trimmed, byAlias, WebhookResolveReason.ALIAS);
                    return byAlias;
                }
            }

            const byCameraCode = await this.cameraRepo.findOne({
                where: { code: trimmed, status: 'Active', is_deleted: false },
            });
            if (byCameraCode) {
                this.assertHttpPushCamera(byCameraCode, 'HTTP push webhook (camera code)');
                this.logWebhookResolution(trimmed, byCameraCode, WebhookResolveReason.CAMERA_CODE);
                return byCameraCode;
            }

            const byCentre = await this.cameraRepo.find({
                where: {
                    status: 'Active',
                    is_deleted: false,
                },
            }).then(rows => rows.filter(c => c.centreCode === trimmed));
            const pushCameras = this.filterHttpPushCameras(byCentre);
            const fromCentre = this.disambiguateCamerasByRequestIp(
                pushCameras,
                req,
                `centre "${trimmed}" (HTTP push)`,
            );
            if (fromCentre) {
                this.logWebhookResolution(trimmed, fromCentre, WebhookResolveReason.CENTRE_CODE);
                return fromCentre;
            }

            throw new BadRequestException(
                `No active camera matched webhook identifier "${trimmed}" (centre/camera code or alias)`,
            );
        }

        const fromIp = await this.resolveCameraFromRequestIp(req);
        if (!fromIp) {
            throw new BadRequestException(
                'Missing query param: cameraCode, and no HTTP push camera matched the request IP',
            );
        }
        this.assertHttpPushCamera(fromIp, 'HTTP push webhook (request IP)');
        this.logWebhookResolution(fromIp.ipAddress, fromIp, WebhookResolveReason.REQUEST_IP);
        return fromIp;
    }



    /**
    * Hikvision Alarm Server often encodes `?cameraCode=C1` as `?cameraCode%3dC1`,
    * so Express sees an empty `cameraCode` query param.
    */
    public async parseHikvisionWebhookCameraCode(req: Request): Promise<string | null> {
        const direct = req.query.cameraCode;
        if (typeof direct === 'string' && direct.trim()) {
            return direct.trim();
        }

        const raw = req.originalUrl || req.url || '';
        const qIndex = raw.indexOf('?');
        if (qIndex >= 0) {
            const qs = raw.slice(qIndex + 1).split('#')[0];
            const normal = qs.match(/(?:^|&)cameraCode=([^&]+)/i);
            if (normal?.[1]) {
                return decodeURIComponent(normal[1].trim());
            }
            const encodedEq = qs.match(/(?:^|&)cameraCode%3[dD]([^&]+)/i);
            if (encodedEq?.[1]) {
                return decodeURIComponent(encodedEq[1].trim());
            }
            const bare = qs.match(/^cameraCode%3[dD](.+)$/i);
            if (bare?.[1]) {
                return decodeURIComponent(bare[1].trim());
            }
        }

        for (const key of Object.keys(req.query)) {
            const fromKey = key.match(/^cameraCode%3[dD](.+)$/i);
            if (fromKey?.[1]) {
                return decodeURIComponent(fromKey[1].trim());
            }
        }

        return null;
    }

    /** Persist raw webhook bytes + request metadata for inspection, then parse from disk/buffer */
    public async saveRawWebhookCapture(req: Request, body: Buffer, cameraCodeHint?: string | null): Promise<WebhookRawCapture> {
        const baseDir = this.getWebhookRawCaptureDir();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeCode = (cameraCodeHint ?? 'unknown').replace(/[^\w-]/g, '_');
        const folder = path.join(baseDir, `${stamp}_${safeCode}`);
        fs.mkdirSync(folder, { recursive: true });

        const bodyPath = path.join(folder, 'body.bin');
        const metaPath = path.join(folder, 'request-meta.json');

        fs.writeFileSync(bodyPath, body);

        const meta = {
            capturedAt: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl || req.url,
            path: req.path,
            query: req.query,
            ip: req.ip,
            ips: req.ips,
            headers: req.headers,
            bodyLength: body.length,
            bodyPreviewHex: body.subarray(0, Math.min(256, body.length)).toString('hex'),
            bodyPreviewUtf8: body
                .subarray(0, Math.min(512, body.length))
                .toString('utf8')
                .replace(/[^\x20-\x7E\r\n\t]/g, '.'),
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        return { folder, bodyPath, metaPath };
    }





    /**
     * Main entry point for incoming ANPR events
     * Called by controller with HTTP request
     *
     * @param req - Express request (HTTP push)
     * @param rawBody - Pre-read request body buffer
     * @param cameraCodeHint - Already-parsed camera code (avoids re-parsing)
     * @throws BadRequestException if validation fails
     */
    async processIncomingEvent(req: Request, rawBody?: Buffer, cameraCodeHint?: string | null): Promise<void> {
        try {
            const fromQuery = cameraCodeHint ?? (await this.parseHikvisionWebhookCameraCode(req)) ?? '';
            const camera = await this.resolveCameraForWebhook(fromQuery || null, req);
            if (!this.methodConfig.acceptsInbound(camera, CameraIntegrationMethod.PUSH)) {
                this.methodConfig.logInboundRejection(
                    camera,
                    CameraIntegrationMethod.PUSH,
                    'HTTP push webhook',
                );
                return;
            }
            const eventDto = await this.processPost(req, camera.cameraCode, rawBody);
            if (!eventDto) {
                return;
            }
            await this.processEvent(eventDto);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(chalk.red(`[ANPR Service] Failed to process incoming event: ${message}`));
            throw error;
        }
    }


    /* Process incoming HTTP POST from camera. */
    async processPost(req: Request, cameraCode: string, rawBody?: Buffer): Promise<ParsedAnprEvent | null> {
        const startTime = Date.now();
        try {
            this.logger.debug(`[HTTP Push] Starting multipart parse from ${req.ip} (cameraCode: ${cameraCode})`);

            // ─── Step 1: Parse multipart payload ────────────────────

            const payload = rawBody
                ? await this.multipartParser.parseBuffer(rawBody, req.headers)
                : await this.multipartParser.parse(req);

            this.dumpHikvisionWebhookPayload(req, cameraCode, payload);

            this.logger.debug(`[HTTP Push] Multipart parsed: XML ${payload.xmlBuffer.length}B, ${Object.keys(payload.files).length} files.`);

            // ─── Step 2: Parse XML to normalized DTO ───────────────

            const parsedXml = this.xmlParser.parseAnprXml(payload.xmlBuffer);

            const gate = await this.eventGuard.shouldAcceptEvent(
                parsedXml.plateNumber,
                parsedXml.captureTime,
            );
            if (!gate.accept) {
                this.eventGuard.logSkip(parsedXml.plateNumber, gate, 'HTTP Push');
                return null;
            }

            // Construct the unified ParsedAnprEventDto
            const eventDto: ParsedAnprEvent = {
                plateNumber: parsedXml.plateNumber,
                captureTime: parsedXml.captureTime,
                confidenceScore: parsedXml.confidence,
                plateCharBelieve: parsedXml.charConfidenceCsv ?? null,
                cameraIp: parsedXml.cameraIp ?? null,
                cameraMac: parsedXml.cameraMac ?? null,
                cameraCode: cameraCode,
                laneNumber: parsedXml.laneNumber ?? null,
                vehicleType: parsedXml.vehicleType ?? null,
                vehicleColour: parsedXml.vehicleColour ?? null,
                plateColour: parsedXml.plateColour ?? null,
                direction: parsedXml.direction ?? null,
                isHazardous: parsedXml.isHazardous ?? null,
                rawPayload: parsedXml.rawPayload,
            };

            // ─── Step 3: Compress & save images to 50% quality ─────

            const imageMetadata: Record<string, number> = {};
            for (const [filename, buffer] of Object.entries(payload.files)) {
                imageMetadata[filename] = buffer.length;
            }

            const imageResult = await this.imageProcessor.saveCompressedImages(
                payload.files,
                eventDto.plateNumber,
            );

            eventDto.plateImagePath = imageResult.plateImagePath ?? null;
            eventDto.sceneImagePath = imageResult.sceneImagePath ?? null;

            this.logger.debug(
                `[HTTP Push] Images compressed and saved: plate=${imageResult.plateImagePath}, scene=${imageResult.sceneImagePath}`,
            );

            // ─── Step 4: Build rawFileResponse for audit ───────────

            const rawFileResponse = this.rawFileResponseBuilder.buildMethodA(
                req,
                payload.xmlBuffer.length,
                imageMetadata,
            );

            eventDto.rawFileResponse = rawFileResponse;
            eventDto.sourceMethod = CameraIntegrationMethod.PUSH;

            const elapsed = Date.now() - startTime;

            this.logger.log(
                `[HTTP Push] ✓ Processed in ${elapsed}ms: plate=${eventDto.plateNumber}, confidence=${eventDto.confidenceScore}%`,
            );

            return eventDto;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `[HTTP Push] ✗ Failed to process from ${cameraCode}: ${message}`,
            );
            throw new BadRequestException(`HTTP Push parse error: ${message}`);
        }
    }

    /**
     * Core event processing logic
     * Used by all integration ingest paths after parsing
     *
     * @param eventDto - Parsed ANPR event from method service
     * @returns true when a new row was persisted (and broadcast); false if skipped (confidence, duplicate, etc.)
     * @throws Error if database save fails
    */
    async processEvent(eventDto: ParsedAnprEvent): Promise<boolean> {
        try {
            // ─── Step 0: Year-plate filter ───────────────────────
            // Cameras sometimes OCR a year painted on a surface (e.g. "2026").
            // These are meaningless; skip before any DB work.
            if (eventDto.isYearPlate === true) {
                this.logger.log(
                    `[ANPR Service] Skipped year-plate: ${eventDto.plateNumber}`,
                );
                return false;
            }

            const gate = await this.eventGuard.shouldAcceptEvent(
                eventDto.plateNumber,
                eventDto.captureTime,
            );
            if (!gate.accept) {
                this.eventGuard.logSkip(eventDto.plateNumber, gate);
                return false;
            }

            // ─── Step 1: Fetch camera config ────────────────────

            const camera = await this.cameraRepo.findOne({
                where: { code: eventDto.cameraCode || '' },
            });

            if (!camera) {
                this.logger.warn(
                    `[ANPR Service] Camera config not found: ${eventDto.cameraCode}`,
                );
                // Still save event but flag missing config
                eventDto.centreCode = 'UNKNOWN';
                eventDto.laneNumber = null;
            } else {
                const required = this.methodConfig.sourceMethodToIntegration(
                    eventDto.sourceMethod,
                );
                if (
                    required &&
                    !this.methodConfig.acceptsInbound(camera, required)
                ) {
                    this.methodConfig.logInboundRejection(
                        camera,
                        required,
                        `inbound event sourceMethod=${eventDto.sourceMethod}`,
                    );
                    return false;
                }

                // Enrich with camera config
                eventDto.centreCode = camera.centreCode;
                eventDto.laneNumber = camera.laneNumber;
                eventDto.integrationMethod = this.methodConfig.configuredMethod(camera);
            }

            // ─── Step 2: Apply confidence filter ────────────────

            const confidenceThreshold = 80;
            if (!this.passesConfidenceFilter(eventDto, confidenceThreshold)) {
                this.logger.debug(
                    `[ANPR Service] Event rejected by confidence filter: ${eventDto.plateNumber}`,
                );
                return false;
            }

            // ─── Step 3: Convert DTO to entity & save ──────────

            const entity = new AnprEventEntity();
            Object.assign(entity, eventDto);

            const savedEvent = await this.anprEventRepo.save(entity);

            this.logger.log(
                `[ANPR Service] ✓ Saved event #${savedEvent.id}: ${savedEvent.plateNumber} (method=${eventDto.sourceMethod})`,
            );

            // ─── Step 4: Update camera health metrics ──────────

            if (camera) {
                camera.lastSeenAt = new Date();
                camera.lastEventAt = new Date();
                camera.isOnline = true;
                await this.cameraRepo.save(camera);
            }

            // ─── Step 5: Broadcast via WebSocket ────────────────

            this.broadcastEvent(savedEvent);

            // ─── Step 6: Bridge to anpr_captures (transaction layer) ──────────

            if (camera) {
                try {
                    await this.anprCaptureService.create(
                        {
                            plate_number: savedEvent.plateNumber,
                            normalized_plate: savedEvent.plateNumber,
                            plate_confidence: savedEvent.confidenceScore ?? undefined,
                            capture_time: savedEvent.captureTime.toISOString(),
                            camera_id: camera.id,
                            lane: savedEvent.laneNumber != null ? String(savedEvent.laneNumber) : undefined,
                            direction: eventDto.direction ?? undefined,
                            country_code: 'OM',
                            plate_color: savedEvent.plateColour ?? undefined,
                            vehicle_type: savedEvent.vehicleType ?? undefined,
                            vehicle_color: savedEvent.vehicleColour ?? undefined,
                        },
                        { id: 'system', email: 'system@ivis.internal' } as any,
                    );
                } catch (bridgeErr) {
                    this.logger.warn(
                        `[ANPR Service] Bridge to anpr_captures failed: ${(bridgeErr as Error).message}`,
                    );
                }
            }

            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[ANPR Service] Process event failed: ${message}`);
            throw error;
        }
    }

    /* Broadcast ANPR event to all connected WebSocket clients. */
    private broadcastEvent(event: AnprEventEntity): void {
        try {
            const wsPayload = {
                id: event.id,
                plate: event.plateNumber,
                plateNumber: event.plateNumber,
                captureTime: event.captureTime.toISOString(),
                confidence: event.confidenceScore,
                confidenceScore: event.confidenceScore,
                lane: event.laneNumber,
                laneNumber: event.laneNumber,
                cameraIp: event.cameraIp,
                cameraCode: event.cameraCode,
                centreCode: event.centreCode,
                vehicleType: event.vehicleType,
                vehicleColour: event.vehicleColour,
                plateColour: event.plateColour,
                plateImagePath: event.plateImagePath,
                sceneImagePath: event.sceneImagePath,
                sourceMethod: event.sourceMethod,
                receivedAt: event.receivedAt.toISOString()
            };

            this.anprGateway.broadcastAnprEvent(wsPayload);

            this.logger.debug(
                `[ANPR Service] WebSocket broadcast: ${event.plateNumber}`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[ANPR Service] WebSocket broadcast failed: ${message}`);
            // Don't throw - WebSocket failure shouldn't fail the event save
        }
    }
}