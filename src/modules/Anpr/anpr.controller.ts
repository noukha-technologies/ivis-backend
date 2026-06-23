import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
    Req,
    Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { UpdateAnprEventDto } from '../../common/dto/anpr-event.dto';
import { AnprService } from './anpr.service';
import { FtpDirectoryScannerService } from './services/ftp-service/ftp-directory-scanner.service';

@Controller('anpr')
export class AnprController {
    constructor(
        private readonly anprService: AnprService,
        private readonly ftpDirectoryScanner: FtpDirectoryScannerService
    ) { }

    @Post('push/webhook')
    @HttpCode(200)
    receiveAnprEvent(
        @Req() req: Request,
        @Res() res: Response,
        @Query('cameraCode') _cameraCode?: string
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

    @Get('events')
    @HttpCode(200)
    async getRecentEvents(
        @Query('limit') limitStr?: string,
        @Query('cameraCode') cameraCode?: string,
    ) {
        const parsed = parseInt(limitStr ?? '100', 10);
        const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 100;
        return this.anprService.getRecentEvents(limit, cameraCode);
    }

    @Get('events/:id')
    @HttpCode(200)
    async getEventById(@Param('id') id: string) {
        const eventId = parseInt(id, 10);
        if (Number.isNaN(eventId)) {
            throw new BadRequestException(`Invalid event id: ${id}`);
        }
        return this.anprService.getEventById(eventId);
    }

    @Put('events/:id')
    @HttpCode(200)
    async updateEvent(@Param('id') id: string, @Body() dto: UpdateAnprEventDto) {
        const eventId = parseInt(id, 10);
        if (Number.isNaN(eventId)) {
            throw new BadRequestException(`Invalid event id: ${id}`);
        }
        return this.anprService.updateEvent(eventId, dto);
    }

    @Delete('events/:id')
    @HttpCode(200)
    async deleteEvent(@Param('id') id: string) {
        const eventId = parseInt(id, 10);
        if (Number.isNaN(eventId)) {
            throw new BadRequestException(`Invalid event id: ${id}`);
        }
        await this.anprService.deleteEvent(eventId);
        return { message: `ANPR event ${eventId} deleted` };
    }
}
