import { Module } from '@nestjs/common';
import { LoggerModule } from '../../common/logger/logger.module';
import { PermissionsController } from './permissions.controller';
import { PermissionService } from './service/permissions.service';

@Module({
  imports: [LoggerModule],
  controllers: [PermissionsController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionsModule { }
