import { Module } from '@nestjs/common';
import { LoggerModule } from '../../common/logger/logger.module';
import { RolesController } from './roles.controller';
import { RolesService } from './service/roles.service';

@Module({
  imports: [LoggerModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
