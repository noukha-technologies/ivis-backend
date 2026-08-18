import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionKeys } from '../../../common/constants/permissions';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaginatedResult } from '../../../common/interfaces/pagination.interface';
import { TajdeedOutboxDao } from '../../database/dao/tajdeed-outbox.dao';
import { TajdeedOutbox } from '../../database/entity/tajdeed-outbox.entity';
import { TajdeedOutboxService } from './services/tajdeed-outbox.service';

/**
 * What IVIS owes the appointment provider, and what became of it.
 *
 * This exists because a rejected event is otherwise invisible: the operator
 * submits a job, sees it complete, and has no way to learn the provider threw
 * the result away. Everything here is read-only bar the re-push.
 */
@ApiTags('Transactions / Provider Events')
@Controller('transactions/provider-events')
export class TajdeedEventsController {
  constructor(
    private readonly outboxDao: TajdeedOutboxDao,
    private readonly outboxService: TajdeedOutboxService,
  ) {}

  @Get()
  @Permissions(PermissionKeys.APPOINTMENTS_VIEW)
  @ApiOperation({
    summary: 'Events pushed to the appointment provider',
    description:
      'Delivery status is ours (did it reach them); event status is theirs (did they apply it). A row can be Accepted and still Failed.',
  })
  @ApiResponse({ status: 200, description: 'Paginated provider events' })
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<TajdeedOutbox>> {
    return this.outboxDao.findPaginated(query);
  }

  @Get(':transactionId')
  @Permissions(PermissionKeys.APPOINTMENTS_VIEW)
  @ApiOperation({ summary: 'One pushed event by its transaction id' })
  @ApiParam({ name: 'transactionId', description: 'The event UUID' })
  findOne(
    @Param('transactionId') transactionId: string,
  ): Promise<TajdeedOutbox | null> {
    return this.outboxDao.findByTransactionId(transactionId);
  }

  @Post(':transactionId/repush')
  @Permissions(PermissionKeys.APPOINTMENTS_UPSERT)
  @ApiOperation({
    summary: 'Re-queue a failed event under a new transaction id',
    description:
      'The provider never moves a failed transaction to processed, and re-sending its id only returns E0007 — so this queues a fresh event rather than retrying the original.',
  })
  @ApiParam({ name: 'transactionId', description: 'The failed event UUID' })
  repush(
    @Param('transactionId') transactionId: string,
  ): Promise<TajdeedOutbox | null> {
    return this.outboxService.repush(transactionId);
  }
}
