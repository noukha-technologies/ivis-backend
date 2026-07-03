import { Reflector } from '@nestjs/core';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ErrorException } from '../common/errors/custom-error.exception';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const resolvedPermissions = user?.resolvedPermissions ?? [];

    const hasPermission = requiredPermissions.every((permission) =>
      resolvedPermissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ErrorException(
        'INVALID_AUTHORISATION_TOKEN',
        'Insufficient permissions',
      );
    }

    return true;
  }
}
