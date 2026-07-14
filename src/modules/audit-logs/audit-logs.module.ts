import { Module } from '@nestjs/common';

import { AuditLogsController } from './audit-logs.controller';
import { AuditService } from './service/audit.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditLogsModule {}
