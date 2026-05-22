import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ErrorException } from '../common/errors/custom-error.exception';
import { verifyAccessToken } from '../common/utils/jwt.util';
import { AuthService } from '../modules/auth/service/auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new ErrorException('FORBIDDEN_REQUEST', 'Authorization token missing');
    }

    const accessToken = authHeader.slice('Bearer '.length).trim();
    const accessSecret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    const payload = verifyAccessToken(accessToken, accessSecret);
    const userContext = await this.authService.buildUserContext(
      payload.sub,
      payload.jti,
    );

    if (!userContext) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN', 'No active session');
    }

    req.user = userContext;
    return true;
  }
}
