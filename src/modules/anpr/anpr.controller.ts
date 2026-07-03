import {
  BadRequestException,
  Controller,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AnprService } from './anpr.service';
import { FtpDirectoryScannerService } from './services/ftp-service/ftp-directory-scanner.service';

@Controller('anpr')
export class AnprController {
  constructor(
    private readonly anprService: AnprService,
    private readonly ftpDirectoryScanner: FtpDirectoryScannerService,
  ) {}

  @Post('push/webhook')
  @HttpCode(200)
  receiveAnprEvent(
    @Req() req: Request,
    @Res() res: Response,
    @Query('cameraCode') _cameraCode?: string,
  ): void {
    this.anprService.handleHikvisionWebhookPush(req, res);
  }

  @Post('ftp/:cameraId/scan')
  @HttpCode(202)
  async triggerFtpScan(@Param('cameraId') cameraId: string) {
    if (!cameraId?.trim()) {
      throw new BadRequestException(`Invalid camera id: ${cameraId}`);
    }
    await this.ftpDirectoryScanner.manualScan(cameraId);
    return {
      message: `FTP directory scan completed for camera ${cameraId}`,
      timestamp: new Date().toISOString(),
    };
  }
}
