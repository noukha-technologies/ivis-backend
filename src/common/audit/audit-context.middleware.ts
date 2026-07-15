import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { getRequestMetadata } from '../utils/request-metadata.util';
import { auditContextStorage } from './audit-context';

/**
 * Establishes AsyncLocalStorage for the request so AuthGuard / subscribers
 * can read who + where without threading args through every service call.
 */
@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const meta = getRequestMetadata(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined;

    auditContextStorage.run(
      {
        ipAddress: meta.ipAddress,
        userAgent,
      },
      () => next(),
    );
  }
}
