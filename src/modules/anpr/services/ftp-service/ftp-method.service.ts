import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { CameraEntity } from '../../../database/entity/camera.entity';

import { AnprEventGuardService } from '../anpr-event-guard.service';
import { AnprMethodConfigService } from '../anpr-method-config.service';
import { FtpConnectionPoolService } from './ftp-connection-pool.service';

import { joinFtpPath } from '../../../../common/utils/ftp-path.util';
import { ParsedAnprEvent } from '../../../../common/interfaces/anpr.interface';
import { CameraIntegrationMethod } from '../../../../common/enums/camera.enums';
import { XmlParserService } from '../../../../common/shared/anpr/xml-parser.service';
import { JpegEventBundle } from '../../../../common/utils/hikvision-jpeg-filename.util';
import { normalizeAnprColour } from '../../../../common/ocr-extraction/anpr-colour.util';
import { pickBestPlateCandidate } from 'src/common/ocr-extraction/oman-plate-normalizer.util';
import { ImageProcessorService } from '../../../../common/shared/anpr/image-processor.service';
import { parseHikvisionOverlayFields } from 'src/common/ocr-extraction/hikvision-overlay-parser.util';
import { RawFileResponseBuilder } from '../../../../common/shared/anpr/raw-file-response.builder.service';
import { OmanPlateClassifierService } from '../../../../common/shared/anpr/oman-plate-classifier.service';
import { HikvisionOverlayOcrService } from '../../../../common/ocr-extraction/hikvision-overlay-ocr.service';
import {
  resolveActiveWatchPath,
  stripCameraPathFromFtpRoot,
} from '../../../../common/utils/ftp-path-resolver.util';
import {
  JpegOcrExtractionDebug,
  writeOcrExtractionDebugFile,
} from 'src/common/ocr-extraction/ocr-extraction-debug.util';

@Injectable()
export class FtpMethodService {
  private readonly logger = new Logger(FtpMethodService.name);

  constructor(
    private readonly ftpPool: FtpConnectionPoolService,
    private readonly xmlParser: XmlParserService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly rawFileResponseBuilder: RawFileResponseBuilder,
    private readonly overlayOcr: HikvisionOverlayOcrService,
    private readonly omanClassifier: OmanPlateClassifierService,
    private readonly eventGuard: AnprEventGuardService,
    private readonly methodConfig: AnprMethodConfigService,
  ) {}

  private rejectIfNotFtpCamera(camera: CameraEntity, context: string): boolean {
    if (this.methodConfig.acceptsInbound(camera, CameraIntegrationMethod.FTP)) {
      return false;
    }
    this.methodConfig.logInboundRejection(
      camera,
      CameraIntegrationMethod.FTP,
      context,
    );
    return true;
  }

  private async passesEventGuard(
    plate: string,
    captureTime: Date,
    logContext: string,
    detail: string,
  ): Promise<boolean> {
    const gate = await this.eventGuard.shouldAcceptEvent(plate, captureTime);
    if (!gate.accept) {
      this.eventGuard.logSkip(plate, gate, logContext);
      this.logger.log(`[${logContext}] Skipped ${detail} (${gate.reason})`);
      return false;
    }
    return true;
  }

  /**
   * Download and parse one remote XML event file. Returns null if file is skipped (parse/filter).
   */
  async buildEventFromRemoteXml(
    camera: CameraEntity,
    remoteXmlPath: string,
    xmlFileName: string,
    xmlSizeBytes: number,
  ): Promise<ParsedAnprEvent | null> {
    if (this.rejectIfNotFtpCamera(camera, 'FTP XML ingest')) {
      return null;
    }

    const start = Date.now();

    let xmlBuffer: Buffer;
    try {
      xmlBuffer = await this.ftpPool.downloadFile(camera, remoteXmlPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[FTP] Failed to download ${remoteXmlPath} (${camera.cameraCode}): ${msg}`,
      );
      return null;
    }

    let parsedXml;
    try {
      parsedXml = this.xmlParser.parseAnprXml(xmlBuffer);
    } catch (err) {
      const msg =
        err instanceof BadRequestException
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      this.logger.warn(
        `[FTP] Skipping non-ANPR or invalid XML ${xmlFileName} (${camera.cameraCode}): ${msg}`,
      );
      return null;
    }

    if (
      !(await this.passesEventGuard(
        parsedXml.plateNumber,
        parsedXml.captureTime,
        'FTP',
        xmlFileName,
      ))
    ) {
      return null;
    }

    const xmlDir = this.remoteDirname(
      remoteXmlPath,
      camera.ftpDirectory ?? '/',
    );

    const files: Record<string, Buffer> = {};
    await this.tryAddImage(
      camera,
      joinFtpPath(xmlDir, 'licensePlatePicture.jpg'),
      'licensePlatePicture.jpg',
      files,
    );
    await this.tryAddImage(
      camera,
      joinFtpPath(xmlDir, 'detectionPicture.jpg'),
      'detectionPicture.jpg',
      files,
    );

    const imagePaths =
      Object.keys(files).length > 0
        ? await this.imageProcessor.saveCompressedImages(
            files,
            parsedXml.plateNumber,
          )
        : { plateImagePath: undefined, sceneImagePath: undefined };

    const eventDto: ParsedAnprEvent = {
      plateNumber: parsedXml.plateNumber,
      captureTime: parsedXml.captureTime,
      confidenceScore: parsedXml.confidence,
      plateCharBelieve: parsedXml.charConfidenceCsv ?? null,
      cameraIp: parsedXml.cameraIp ?? camera.ipAddress,
      cameraMac: parsedXml.cameraMac ?? camera.macAddress ?? null,
      cameraCode: camera.cameraCode,
      centreCode: camera.centreCode,
      laneNumber: camera.laneNumber ?? null,
      channelId: null,
      channelName: null,
      countryCode: null,
      vehicleType: parsedXml.vehicleType ?? null,
      vehicleColour: parsedXml.vehicleColour ?? null,
      plateColour: parsedXml.plateColour ?? null,
      direction: parsedXml.direction ?? null,
      isHazardous: parsedXml.isHazardous ?? null,
      plateImagePath: imagePaths.plateImagePath ?? null,
      sceneImagePath: imagePaths.sceneImagePath ?? null,
      rawPayload: parsedXml.rawPayload,
    };

    eventDto.rawFileResponse = this.rawFileResponseBuilder.buildMethodC(
      camera.ipAddress,
      xmlFileName,
      xmlSizeBytes > 0 ? xmlSizeBytes : xmlBuffer.length,
      camera.ftpDirectory ?? '',
      {
        parsedFromFilename: false,
      },
    );
    eventDto.sourceMethod = CameraIntegrationMethod.FTP;

    const ms = Date.now() - start;
    this.logger.log(
      `[FTP] Parsed ${xmlFileName} for ${camera.cameraCode} in ${ms}ms (plate=${eventDto.plateNumber})`,
    );

    return eventDto;
  }

  /**
   * Parse one XML file from a local mounted directory (mount watch mode).
   */
  async buildEventFromLocalXml(
    camera: CameraEntity,
    localXmlPath: string,
    xmlFileName: string,
    xmlSizeBytes: number,
  ): Promise<ParsedAnprEvent | null> {
    if (this.rejectIfNotFtpCamera(camera, 'FTP XML ingest (mount)')) {
      return null;
    }

    const start = Date.now();

    let xmlBuffer: Buffer;
    try {
      xmlBuffer = await fs.promises.readFile(localXmlPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[FTP Mount] Failed to read ${localXmlPath} (${camera.cameraCode}): ${msg}`,
      );
      return null;
    }

    let parsedXml;
    try {
      parsedXml = this.xmlParser.parseAnprXml(xmlBuffer);
    } catch (err) {
      const msg =
        err instanceof BadRequestException
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      this.logger.warn(
        `[FTP Mount] Skipping invalid XML ${xmlFileName} (${camera.cameraCode}): ${msg}`,
      );
      return null;
    }

    if (
      !(await this.passesEventGuard(
        parsedXml.plateNumber,
        parsedXml.captureTime,
        'FTP Mount',
        xmlFileName,
      ))
    ) {
      return null;
    }

    const xmlDir = path.dirname(localXmlPath);
    const files: Record<string, Buffer> = {};
    await this.tryAddLocalImage(
      path.join(xmlDir, 'licensePlatePicture.jpg'),
      'licensePlatePicture.jpg',
      files,
    );
    await this.tryAddLocalImage(
      path.join(xmlDir, 'detectionPicture.jpg'),
      'detectionPicture.jpg',
      files,
    );

    const imagePaths =
      Object.keys(files).length > 0
        ? await this.imageProcessor.saveCompressedImages(
            files,
            parsedXml.plateNumber,
          )
        : { plateImagePath: undefined, sceneImagePath: undefined };

    const eventDto: ParsedAnprEvent = {
      plateNumber: parsedXml.plateNumber,
      captureTime: parsedXml.captureTime,
      confidenceScore: parsedXml.confidence,
      plateCharBelieve: parsedXml.charConfidenceCsv ?? null,
      cameraIp: parsedXml.cameraIp ?? camera.ipAddress,
      cameraMac: parsedXml.cameraMac ?? camera.macAddress ?? null,
      cameraCode: camera.cameraCode,
      centreCode: camera.centreCode,
      laneNumber: camera.laneNumber ?? null,
      channelId: null,
      channelName: null,
      countryCode: null,
      vehicleType: parsedXml.vehicleType ?? null,
      vehicleColour: parsedXml.vehicleColour ?? null,
      plateColour: parsedXml.plateColour ?? null,
      direction: parsedXml.direction ?? null,
      isHazardous: parsedXml.isHazardous ?? null,
      plateImagePath: imagePaths.plateImagePath ?? null,
      sceneImagePath: imagePaths.sceneImagePath ?? null,
      rawPayload: parsedXml.rawPayload,
    };

    eventDto.rawFileResponse = this.rawFileResponseBuilder.buildMethodC(
      camera.ipAddress,
      xmlFileName,
      xmlSizeBytes > 0 ? xmlSizeBytes : xmlBuffer.length,
      camera.ftpDirectory ?? '',
      { parsedFromFilename: false },
    );
    eventDto.sourceMethod = CameraIntegrationMethod.FTP;

    const ms = Date.now() - start;
    this.logger.log(
      `[FTP Mount] Parsed ${xmlFileName} for ${camera.cameraCode} in ${ms}ms (plate=${eventDto.plateNumber})`,
    );

    return eventDto;
  }

  /**
   * Build ParsedAnprEvent from a Hikvision JPEG bundle (image-only FTP upload).
   */
  async buildEventFromJpegBundle(
    camera: CameraEntity,
    bundle: JpegEventBundle,
  ): Promise<ParsedAnprEvent | null> {
    if (this.rejectIfNotFtpCamera(camera, 'FTP JPEG ingest')) {
      return null;
    }

    // The DETECTION image is the only one that carries data. The camera burns
    // a `Label:Value` strip across its foot — plate, type, colour, brand,
    // direction, confidence — and that strip is the record of what drove onto
    // the lane. The plate crop is a thumbnail and the scene picture is a
    // photograph; neither states anything, they only look like the vehicle.
    //
    // So without the detection image there is nothing to extract. Running on
    // the other two produced captures whose "plate" was OCR of whatever text
    // happened to be in frame — a windscreen sticker, a hoarding — recorded
    // with the same confidence as a real read.
    if (!bundle.vehicleDetectionPath) {
      this.logger.warn(
        `[FTP JPEG] Skipping ${bundle.eventKey} (${camera.cameraCode}) — no VEHICLE_DETECTION image, so no overlay to read`,
      );
      return null;
    }

    const start = Date.now();
    const metadata = await this.overlayOcr.extractFromDetectionImage(
      bundle.vehicleDetectionPath,
    );

    const plateHints = {
      category: metadata?.category,
      plateSize: metadata?.plateSize,
      plateColour: metadata?.plateColour,
      plateType: metadata?.plateType,
    };

    const plateCropDetail = bundle.platePath
      ? await this.overlayOcr.extractPlateFromCropDetailed(bundle.platePath)
      : null;
    const plateCrop = plateCropDetail?.plate ?? null;

    let sceneDetail: Awaited<
      ReturnType<HikvisionOverlayOcrService['extractPlateFromSceneDetailed']>
    > = null;
    if (bundle.vehiclePicturePath) {
      sceneDetail = await this.overlayOcr.extractPlateFromSceneDetailed(
        bundle.vehiclePicturePath,
      );
    }
    const scenePlate = sceneDetail?.plateNumber?.trim().toUpperCase();
    const sceneConfidence = sceneDetail?.confidence;

    const overlayParsed = metadata?.rawOcrText
      ? parseHikvisionOverlayFields(metadata.rawOcrText)
      : null;

    const bestPlate = pickBestPlateCandidate([
      {
        source: 'plate_crop',
        value: plateCrop,
        hints: plateHints,
      },
      {
        source: 'overlay',
        value: overlayParsed?.plateNumber ?? metadata?.plateNumber,
        hints: plateHints,
        confidence: metadata?.confidence,
      },
      {
        source: 'scene',
        value: scenePlate,
        hints: plateHints,
        confidence: sceneConfidence,
      },
    ]);

    const debugAnchor =
      bundle.vehicleDetectionPath ??
      bundle.platePath ??
      bundle.vehiclePicturePath;
    if (debugAnchor) {
      const debugReport: JpegOcrExtractionDebug = {
        eventKey: bundle.eventKey,
        writtenAt: new Date().toISOString(),
        cameraCode: camera.cameraCode,
        files: {
          detection: bundle.vehicleDetectionPath ?? undefined,
          plate: bundle.platePath ?? undefined,
          picture: bundle.vehiclePicturePath ?? undefined,
        },
        detectionOverlay: metadata
          ? {
              rawOcrText: metadata.rawOcrText,
              parsedPlate: metadata.plateNumber ?? null,
              parsedCategory: metadata.category ?? null,
              parsedPlateSize: metadata.plateSize ?? null,
              parsedConfidence: metadata.confidence ?? null,
              parsedFields: {
                plateNumber: overlayParsed?.plateNumber ?? metadata.plateNumber,
                normalizedPlate: metadata.plateNumber,
                category: metadata.category,
                plateSize: metadata.plateSize,
                plateColour: metadata.plateColour,
                plateType: metadata.plateType,
                vehicleType: metadata.vehicleType,
                vehicleColour: metadata.vehicleColour,
                vehicleBrand: metadata.vehicleBrand,
                direction: metadata.direction,
                confidence: metadata.confidence,
                province: metadata.province,
              },
            }
          : undefined,
        plateCrop: plateCropDetail
          ? {
              rawDigitOcr: plateCropDetail.rawDigitOcr,
              rawFullOcr: plateCropDetail.rawFullOcr,
              normalizedPlate: plateCropDetail.plate,
              method: plateCropDetail.method,
            }
          : undefined,
        scene: sceneDetail
          ? {
              rawOcrText: sceneDetail.rawOcrText,
              normalizedPlate: scenePlate ?? null,
            }
          : undefined,
        selection: {
          chosenPlate: bestPlate?.plate,
          source: bestPlate?.source,
          candidates: [
            {
              source: 'plate_crop',
              raw: plateCropDetail?.rawDigitOcr || plateCropDetail?.rawFullOcr,
              normalized: plateCrop,
            },
            {
              source: 'overlay',
              raw: overlayParsed?.plateNumber ?? null,
              normalized:
                bestPlate?.source === 'overlay'
                  ? bestPlate.plate
                  : (metadata?.plateNumber ?? null),
            },
            {
              source: 'scene',
              raw: sceneDetail?.rawOcrText ?? null,
              normalized: scenePlate ?? null,
            },
          ],
        },
      };
      const txtPath = writeOcrExtractionDebugFile(debugAnchor, debugReport);
      if (txtPath) {
        this.logger.log(`[FTP JPEG] OCR debug written: ${txtPath}`);
      }
    }

    const plateNumber = bestPlate?.plate;
    const confidence = metadata?.confidence;
    const captureTime = metadata?.captureTime ?? bundle.captureTime;

    if (!plateNumber) {
      this.logger.warn(
        `[FTP JPEG] No plate extracted for ${bundle.eventKey} (${camera.cameraCode})`,
      );
      return null;
    }

    const minConf = this.overlayOcr.getMinConfidence();
    // A plate read only from the scene photograph is a guess: it is OCR of the
    // whole frame, so it picks up signage and stickers as readily as a plate.
    // It stays as a last resort, but never inherits a confidence it did not
    // earn — the overlay reported none, so neither does this.
    const sceneOnly =
      Boolean(bundle.vehiclePicturePath) &&
      !bundle.platePath &&
      !metadata?.plateNumber &&
      bestPlate?.source === 'scene';
    const effectiveConfidence =
      confidence ?? sceneConfidence ?? (sceneOnly ? 85 : 0);
    if (effectiveConfidence > 0 && effectiveConfidence < minConf) {
      this.logger.warn(
        `[FTP JPEG] Skipping ${plateNumber} — confidence ${effectiveConfidence}% < ${minConf}%`,
      );
      return null;
    }

    if (
      !(await this.passesEventGuard(
        plateNumber,
        captureTime,
        'FTP JPEG',
        bundle.eventKey,
      ))
    ) {
      return null;
    }

    const rawPlateColour = metadata?.plateColour ?? null;
    const omanClassification = this.omanClassifier.classify(
      plateNumber,
      rawPlateColour ?? undefined,
    );
    const plateColour =
      normalizeAnprColour(rawPlateColour) ??
      omanClassification.plateColorName ??
      null;

    const files: Record<string, Buffer> = {};
    if (bundle.platePath) {
      await this.tryAddLocalImage(
        bundle.platePath,
        'licensePlatePicture.jpg',
        files,
      );
    }
    const scenePath = bundle.vehiclePicturePath ?? bundle.vehicleDetectionPath;
    if (scenePath) {
      await this.tryAddLocalImage(scenePath, 'detectionPicture.jpg', files);
    }

    const imagePaths =
      Object.keys(files).length > 0
        ? await this.imageProcessor.saveCompressedImages(files, plateNumber)
        : { plateImagePath: undefined, sceneImagePath: undefined };

    const laneFromChannel = parseInt(bundle.channel, 10);
    const eventDto: ParsedAnprEvent = {
      plateNumber,
      captureTime,
      confidenceScore: effectiveConfidence > 0 ? effectiveConfidence : 85,
      plateCharBelieve: null,
      cameraIp: bundle.ipAddress || camera.ipAddress,
      cameraMac: camera.macAddress ?? null,
      cameraCode: camera.cameraCode,
      centreCode: camera.centreCode,
      laneNumber: Number.isFinite(laneFromChannel)
        ? laneFromChannel
        : (camera.laneNumber ?? null),
      channelId: null,
      channelName: null,
      countryCode: null,
      vehicleType: metadata?.vehicleType ?? null,
      vehicleColour: normalizeAnprColour(metadata?.vehicleColour) ?? null,
      plateColour,
      direction: metadata?.direction ?? null,
      isHazardous: null,
      plateImagePath: imagePaths.plateImagePath ?? null,
      sceneImagePath: imagePaths.sceneImagePath ?? null,
      rawPayload: {
        source: 'jpeg_bundle',
        eventKey: bundle.eventKey,
        timestampKey: bundle.timestampKey,
        ocrRaw: metadata?.rawOcrText ?? null,
        ocrParsed: metadata
          ? {
              vehicleBrand: metadata.vehicleBrand ?? null,
              plateSize: metadata.plateSize ?? null,
              plateType: metadata.plateType ?? null,
              direction: metadata.direction ?? null,
              province: metadata.province ?? null,
              category: metadata.category ?? null,
              plateSource: bestPlate?.source ?? null,
            }
          : null,
      },
      plateType: omanClassification.plateType,
      plateTypeCategory: omanClassification.plateTypeCategory,
      plateColorCategory: omanClassification.plateColorCategory,
      plateColorName: omanClassification.plateColorName,
      isEV: omanClassification.isEV,
      shouldAlert: omanClassification.shouldAlert,
      alertReason: omanClassification.alertReason,
      isYearPlate: omanClassification.isYearPlate,
    };

    const ftpRoot = stripCameraPathFromFtpRoot(
      camera.ftpDirectory ?? '',
      camera.centreCode ?? '',
      camera.ipAddress,
    );
    eventDto.rawFileResponse = {
      ...this.rawFileResponseBuilder.buildMethodC(
        camera.ipAddress,
        bundle.vehicleDetectionPath
          ? path.basename(bundle.vehicleDetectionPath)
          : bundle.eventKey,
        0,
        resolveActiveWatchPath(camera) ?? ftpRoot,
        { parsedFromFilename: true },
      ),
      source: 'jpeg_bundle',
      transport: 'local_mount_jpeg',
      eventKey: bundle.eventKey,
      timestampKey: bundle.timestampKey,
      files: {
        detection: bundle.vehicleDetectionPath,
        picture: bundle.vehiclePicturePath,
        plate: bundle.platePath,
      },
    };
    eventDto.sourceMethod = CameraIntegrationMethod.FTP;

    const ms = Date.now() - start;
    this.logger.log(
      `[FTP JPEG] Parsed ${bundle.eventKey} for ${camera.cameraCode} in ${ms}ms (plate=${plateNumber})`,
    );

    return eventDto;
  }

  private async tryAddLocalImage(
    localPath: string,
    localKey: string,
    out: Record<string, Buffer>,
  ): Promise<void> {
    try {
      const buf = await fs.promises.readFile(localPath);
      if (buf.length > 0) {
        out[localKey] = buf;
      }
    } catch {
      /* optional image */
    }
  }

  private remoteDirname(remoteXmlPath: string, fallbackDir: string): string {
    const norm = remoteXmlPath.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    if (idx <= 0) {
      return fallbackDir.replace(/\\/g, '/').replace(/\/+$/, '');
    }
    return norm.slice(0, idx);
  }

  private async tryAddImage(
    camera: CameraEntity,
    remotePath: string,
    localKey: string,
    out: Record<string, Buffer>,
  ): Promise<void> {
    const baseName =
      remotePath.replace(/\\/g, '/').split('/').pop() ?? remotePath;
    try {
      const buf = await this.ftpPool.downloadFile(camera, remotePath);
      if (buf.length > 0) {
        out[localKey] = buf;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[FTP] Failed to download ${baseName} (${camera.cameraCode}): ${msg}`,
      );
    }
  }
}
