import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../constants/permissions';

export const Permissions = (...permissions: PermissionKey[]) =>
  SetMetadata('permissions', permissions);
