import { Request } from 'express';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { UserContext } from '../dto/auth.dto';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user!;
  },
);
