import { XMLParser } from "fast-xml-parser";
import { BadRequestException, Injectable } from "@nestjs/common";

import { AnprNormalizedEventDto } from "../../interfaces/anpr.interface";
import { normalizeAnprColour } from "../../utils/anpr-colour.util";

import { OmanPlateClassifierService } from "./oman-plate-classifier.service";

type HikvisionAlertPayload = {
    EventNotificationAlert?: {
        eventType?: string;
        dateTime?: string;
        ipAddress?: string;
        macAddress?: string;
        ANPR?: {
            licensePlate?: string;
            confidenceLevel?: string | number;
            line?: string | number;
            direction?: string;
            vehicleType?: string;
            plateColor?: string;
            plateCharBelieve?: string;
            dangmark?: string;
            vehicleInfo?: {
                color?: string;
            };
        };
    };
};

@Injectable()
export class XmlParserService {
    private readonly parser = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: true,
        trimValues: true,
    });

    constructor(private readonly omanClassifier: OmanPlateClassifierService) { }

    parseAnprXml(xmlBuffer: Buffer): AnprNormalizedEventDto {
        const payload = this.parser.parse(xmlBuffer.toString()) as HikvisionAlertPayload;
        const alert = payload.EventNotificationAlert;

        if (!alert) {
            throw new BadRequestException("Invalid XML: EventNotificationAlert missing");
        }

        const eventType = String(alert.eventType ?? "").trim();
        if (eventType !== "ANPR") {
            throw new BadRequestException(`Unsupported eventType: ${eventType || "empty"}`);
        }

        const plateNumber = String(alert.ANPR?.licensePlate ?? "")
            .trim()
            .toUpperCase();
        if (!plateNumber) {
            throw new BadRequestException("Invalid XML: ANPR.licensePlate missing");
        }

        const captureTime = new Date(String(alert.dateTime ?? ""));
        if (Number.isNaN(captureTime.getTime())) {
            throw new BadRequestException("Invalid XML: dateTime is not a valid ISO date");
        }

        const confidence = this.parseOptionalNumber(alert.ANPR?.confidenceLevel);
        if (confidence === undefined) {
            throw new BadRequestException("Invalid XML: ANPR.confidenceLevel missing");
        }

        const dangmark = String(alert.ANPR?.dangmark ?? "").toLowerCase();
        const isHazardous =
            dangmark === "yes" ? true : dangmark === "no" ? false : null;

        const plateColour = this.parseOptionalString(alert.ANPR?.plateColor);

        // ── Oman plate classification ─────────────────────────────────────
        const omanClassification = this.omanClassifier.classify(
            plateNumber,
            plateColour,
        );

        return {
            eventType,
            plateNumber,
            captureTime,
            confidence,
            laneNumber: this.parseOptionalNumber(alert.ANPR?.line),
            direction: this.parseOptionalString(alert.ANPR?.direction),
            cameraIp: this.parseOptionalString(alert.ipAddress),
            cameraMac: this.parseOptionalString(alert.macAddress),
            vehicleType: this.parseOptionalString(alert.ANPR?.vehicleType),
            vehicleColour:
                normalizeAnprColour(
                    this.parseOptionalString(alert.ANPR?.vehicleInfo?.color),
                ) ?? undefined,
            plateColour: normalizeAnprColour(plateColour) ?? undefined,
            isHazardous,
            charConfidenceCsv: this.parseOptionalString(alert.ANPR?.plateCharBelieve),
            rawPayload: (payload as unknown as Record<string, unknown>) ?? {},
            // Oman enrichment
            plateType: omanClassification.plateType,
            plateTypeCategory: omanClassification.plateTypeCategory,
            plateColorCategory: omanClassification.plateColorCategory,
            plateColorName: omanClassification.plateColorName,
            isEV: omanClassification.isEV,
            shouldAlert: omanClassification.shouldAlert,
            alertReason: omanClassification.alertReason,
            isYearPlate: omanClassification.isYearPlate,
        };
    }

    private parseOptionalNumber(value: string | number | undefined): number | undefined {
        if (value === undefined || value === null) {
            return undefined;
        }
        const num = Number(value);
        return Number.isFinite(num) ? num : undefined;
    }

    private parseOptionalString(value: string | undefined): string | undefined {
        if (!value) {
            return undefined;
        }
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : undefined;
    }

    /** Parse Hikvision GET /ISAPI/System/deviceInfo XML response. */
    parseDeviceInfo(xml: string | Buffer): { model?: string; serialNumber?: string; firmware?: string; } {
        const raw = Buffer.isBuffer(xml) ? xml.toString("utf8") : xml;
        const payload = this.parser.parse(raw) as Record<string, unknown>;
        const di = payload.DeviceInfo ?? payload.deviceInfo;
        if (!di || typeof di !== "object") {
            return {};
        }
        const o = di as Record<string, string | number | undefined>;
        return {
            model: this.parseOptionalString(String(o.model ?? "")),
            serialNumber: this.parseOptionalString(String(o.serialNumber ?? "")),
            firmware: this.parseOptionalString(
                String(o.firmwareVersion ?? o.firmware ?? ""),
            ),
        };
    }
}
