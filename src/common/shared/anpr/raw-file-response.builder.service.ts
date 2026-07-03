import { Request } from 'express';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RawFileResponseBuilder {
  /**
   * Build rawFileResponse for HTTP push ingest
   *
   * @param req - Express request object
   * @param xmlSize - Size of XML buffer
   * @param imageMetadata - Image filenames and sizes
   * @returns JSONB object for storage
   */
  buildMethodA(
    req: Request,
    xmlSize: number,
    imageMetadata: Record<string, number>,
  ): Record<string, unknown> {
    return {
      method: 'PUSH',
      source: 'http_push',
      transport: 'multipart/form-data',

      // Request details
      requestIp: req.ip,
      requestHeaders: {
        contentType: req.get('content-type'),
        contentLength: req.get('content-length'),
        userAgent: req.get('user-agent'),
      },

      // Payload details
      xmlSize,
      imageCount: Object.keys(imageMetadata).length,
      images: imageMetadata,
      totalPayloadSize:
        xmlSize + Object.values(imageMetadata).reduce((a, b) => a + b, 0),

      // Timing
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * Build rawFileResponse for FTP ingest
   *
   * @param ftpServer - FTP server hostname
   * @param filename - Original filename
   * @param fileSize - File size in bytes
   * @param directory - FTP directory path
   * @param options - Additional metadata
   * @returns JSONB object for storage
   */
  buildMethodC(
    ftpServer: string,
    filename: string,
    fileSize: number,
    directory: string,
    options?: {
      parsedFromFilename?: boolean;
      uploadedAt?: Date;
      fileModTime?: Date;
    },
  ): Record<string, unknown> {
    return {
      method: 'FTP',
      source: 'ftp_file_watch',
      transport: 'ftp_upload',

      // FTP details
      ftpServer,
      directory,
      filename,
      fileSize,

      // Parsing metadata
      parsedFromFilename: options?.parsedFromFilename ?? false,
      uploadedAt: options?.uploadedAt?.toISOString(),
      fileModTime: options?.fileModTime?.toISOString(),

      // Timing
      detectedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Enhance existing rawFileResponse with additional data
   * (e.g., add retry counts, connection duration, etc.)
   *
   * @param existing - Existing rawFileResponse object
   * @param updates - Fields to add/update
   * @returns Updated rawFileResponse
   */
  enhance(
    existing: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...existing,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
  }
}
