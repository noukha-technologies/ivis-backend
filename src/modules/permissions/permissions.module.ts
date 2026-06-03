import { Module } from '@nestjs/common';
import { LoggerModule } from '../../common/logger/logger.module';
import { PermissionsController } from './permissions.controller';
import { PermissionProfileService } from './service/permission-profile.service';

@Module({
  imports: [LoggerModule],
  controllers: [PermissionsController],
  providers: [PermissionProfileService],
  exports: [PermissionProfileService],
})
export class PermissionsModule {}
