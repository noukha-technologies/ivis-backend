import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserContext } from '../dto/auth.dto.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as UserContext;
  },
);
