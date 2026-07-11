import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import * as bcrypt from 'bcrypt';

import { ErrorException } from '../../../common/errors/custom-error.exception';
import { CentreApiKeyDao } from '../../database/dao/centre-api-key.dao';

/**
 * Machine-to-machine auth for central-side /sync/** routes (Database Sync's
 * push/pull chunks, per Database_sync_arch_replan.md §4). Separate from the
 * global AuthGuard/JWT pipeline entirely — these routes are @Public() for
 * AuthGuard's purposes and use this guard instead, applied explicitly via
 * @UseGuards on the controller.
 *
 * Bearer token is the centre's plaintext API key; centre_api_keys stores
 * only its bcrypt hash (never plaintext), same convention as User.password.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly centreApiKeyDao: CentreApiKeyDao) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN', 'API key missing');
    }

    const presentedKey = authHeader.slice('Bearer '.length).trim();
    if (!presentedKey) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN', 'API key missing');
    }

    const activeKeys = await this.centreApiKeyDao.findAllActive();
    for (const row of activeKeys) {
      if (await bcrypt.compare(presentedKey, row.key_hash)) {
        req.centreId = row.centre_id;
        return true;
      }
    }

    throw new ErrorException('INVALID_AUTHORISATION_TOKEN', 'Invalid API key');
  }
}
