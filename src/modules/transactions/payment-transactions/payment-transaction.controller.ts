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
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreatePaymentTransactionDto,
  UpdatePaymentTransactionDto,
} from '../../../common/dto/payment-transaction.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';
import { PaymentTransactionService } from './services/payment-transaction.service';

@ApiTags('Transactions / Payment Transactions')
@Controller('transactions/payment-transactions')
export class PaymentTransactionController {
  constructor(private readonly paymentTransactionService: PaymentTransactionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create payment transaction (auto-creates job when status is Paid)',
  })
  async create(@Body() createDto: CreatePaymentTransactionDto) {
    const data = await this.paymentTransactionService.create(createDto);
    return { message: 'Payment transaction created successfully', data };
  }

  @Get()
  @ApiOperation({ summary: 'List payment transactions (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.paymentTransactionService.findAll(query);
    return { message: 'Payment transactions retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment transaction by ID' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.paymentTransactionService.findOne(id);
    return { message: 'Payment transaction retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update payment transaction (Paid triggers job if missing)' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdatePaymentTransactionDto,
  ) {
    const data = await this.paymentTransactionService.update(id, updateDto);
    return { message: 'Payment transaction updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete payment transaction' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.paymentTransactionService.remove(id);
    return { message: 'Payment transaction deleted successfully', data: null };
  }
}
