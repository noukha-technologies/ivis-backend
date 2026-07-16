import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditService } from './service/audit.service';

@ApiTags('Audit Logs')
@ApiBearerAuth('Bearer')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary:
      'List audit logs (paginated). Search by performer/action text; filter by performedBy, action, date range.',
  })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved.' })
  async findAll(@Query() query: AuditLogQueryDto) {
    const result = await this.auditService.findAll(query);
    return { message: 'Audit logs retrieved successfully', ...result };
  }
}
