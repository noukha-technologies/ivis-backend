import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppLogger } from '../logger/app.logger';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    this.logger.apiRequest(req.method, req.originalUrl);

    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      this.logger.apiResponse(
        req.method,
        req.originalUrl,
        res.statusCode,
        responseTime,
      );
    });

    next();
  }
}
