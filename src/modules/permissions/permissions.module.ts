import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionService } from './service/permission.service';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionsModule {}
