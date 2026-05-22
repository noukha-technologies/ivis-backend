import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { getRequestMetadata } from '../utils/request-metadata.util.js';

export const RequestMetadata = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const req: Request = ctx.switchToHttp().getRequest();
    return getRequestMetadata(req);
  },
);
