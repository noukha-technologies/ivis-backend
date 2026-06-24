import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';

import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

import { PaymentsService } from './services/payments.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreatePaymentsDto, UpdatePaymentsDto } from '../../../common/dto/payments.dto';

@ApiTags('Transactions / Payment Transactions')
@Controller('transactions/payment-transactions')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create payment transaction (auto-creates job when status is Paid)' })
  async create(@CurrentUser() actor: UserContext, @Body() createDto: CreatePaymentsDto) {
    const data = await this.paymentsService.create(createDto, actor);
    return { message: 'Payment transaction created successfully', data };
  }

  @Get()
  @ApiOperation({ summary: 'List payment transactions (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.paymentsService.findAll(query);
    return { message: 'Payment transactions retrieved successfully', ...result };
  }

  @Get('job-lookup/:jobId')
  @ApiOperation({ summary: 'Pre-fill payment form from an existing job' })
  @ApiParam({ name: 'jobId', type: String })
  async jobLookup(@Param('jobId', ParseSnowflakeIdPipe) jobId: string) {
    const data = await this.paymentsService.lookupJob(jobId);
    return { message: 'Job details retrieved successfully', data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment transaction by ID' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.paymentsService.findOne(id);
    return { message: 'Payment transaction retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update payment transaction (Paid triggers job if missing)' })
  async update(
    @CurrentUser() actor: UserContext,
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdatePaymentsDto,
  ) {
    const data = await this.paymentsService.update(id, updateDto, actor);
    return { message: 'Payment transaction updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete payment transaction' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.paymentsService.remove(id);
    return { message: 'Payment transaction deleted successfully', data: null };
  }
}
