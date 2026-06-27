export interface AnprRawMultipartInterface {
    xmlBuffer: Buffer;
    files: Record<string, Buffer>;
    meta?: {
        contentType?: string;
        receivedAt: Date;
    };
}

export interface AnprNormalizedEventDto {
    eventType: string;
    plateNumber: string;
    captureTime: Date;
    confidence: number;
    laneNumber?: number;
    direction?: string;
    cameraIp?: string;
    cameraMac?: string;
    vehicleType?: string;
    vehicleColour?: string;
    plateColour?: string;
    isHazardous?: boolean | null;
    charConfidenceCsv?: string;
    rawPayload: Record<string, unknown>;
    plateType?: string | null;
    plateTypeCategory?: string | null;
    plateColorCategory?: string | null;
    plateColorName?: string | null;
    isEV?: boolean | null;
    shouldAlert?: boolean | null;
    alertReason?: string | null;
    isYearPlate?: boolean | null;
}

export interface ProcessedAnprImagesDto {
    plateImage?: Buffer;
    sceneImage?: Buffer;
    compositeImage?: Buffer;
}

export interface ParsedAnprEvent {
    id?: number;
    plateNumber: string;
    captureTime: Date;
    confidenceScore: number;
    plateCharBelieve?: string | null;
    cameraIp?: string | null;
    cameraMac?: string | null;
    cameraCode?: string | null;
    centreCode?: string | null;
    laneNumber?: number | null;
    channelId?: number | null;
    channelName?: string | null;
    countryCode?: number | null;
    vehicleType?: string | null;
    vehicleColour?: string | null;
    plateColour?: string | null;
    direction?: string | null;
    isHazardous?: boolean | null;
    plateImagePath?: string | null;
    sceneImagePath?: string | null;
    integrationMethod?: string | null;
    sourceMethod?: string | null;
    rawFileResponse?: Record<string, unknown> | null;
    rawPayload?: Record<string, unknown> | null;
    plateType?: string | null;
    plateTypeCategory?: string | null;
    plateColorCategory?: string | null;
    plateColorName?: string | null;
    isEV?: boolean | null;
    shouldAlert?: boolean | null;
    alertReason?: string | null;
    isYearPlate?: boolean | null;
}

export type WebhookRawCapture = {
    folder: string;
    bodyPath: string;
    metaPath: string;
};

/**
 * Serialized inbound webhook, as published to RabbitMQ. Carries the raw
 * multipart bytes (base64) plus the minimal request metadata the consumer needs
 * to reconstruct processing (content-type for Busboy, IP for camera
 * disambiguation + audit).
 */
export interface AnprWebhookQueueMessage {
    rawBodyB64: string;
    headers: Record<string, string | undefined>;
    ip: string | null;
    cameraCodeHint: string | null;
    receivedAt: string;
}

/** Decoded form of {@link AnprWebhookQueueMessage} used inside the service layer. */
export interface AnprWebhookContext {
    rawBody: Buffer;
    headers: Record<string, string | undefined>;
    ip: string | null;
    cameraCodeHint: string | null;
    receivedAt: string;
}

export interface HikvisionOverlayMetadata {
    plateNumber?: string;
    confidence?: number;
    captureTime?: Date;
    vehicleType?: string;
    vehicleColour?: string;
    vehicleBrand?: string;
    direction?: string;
    plateColour?: string;
    plateSize?: string;
    plateType?: string;
    province?: string;
    category?: string;
    rawOcrText: string;
};

export interface PlateCropExtraction {
    plate: string | null;
    rawDigitOcr: string;
    rawFullOcr?: string;
    method: 'digit_region' | 'full_crop';
};