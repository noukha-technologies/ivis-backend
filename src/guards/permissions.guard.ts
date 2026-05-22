import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserContext } from '../common/dto/auth.dto';
import { ErrorException } from '../common/errors/custom-error.exception';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as UserContext;
    const resolvedPermissions = user?.resolvedPermissions ?? [];

    const hasPermission = requiredPermissions.every((permission) =>
      resolvedPermissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ErrorException('INVALID_AUTHORISATION_TOKEN', 'Insufficient permissions');
    }

    return true;
  }
}
