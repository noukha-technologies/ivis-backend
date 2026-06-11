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
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { UserContext } from '../../../common/dto/auth.dto';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';
import { CreatePaymentDto, UpdatePaymentDto } from '../../../common/dto/payment.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaymentService } from './services/payment.service';

@ApiTags('Masters / Payments')
@Controller('masters/payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new payment mode' })
  @ApiResponse({ status: 201, description: 'Payment mode created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or payment_id.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createPaymentDto: CreatePaymentDto,
  ) {
    const payment = await this.paymentService.create(createPaymentDto, actor);
    return { message: 'Payment created successfully', data: payment };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all payments (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'code, customer name, customer phone',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiResponse({ status: 200, description: 'Payments list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.paymentService.findAll(query);
    return { message: 'Payments retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a payment mode by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Payment Snowflake ID' })
  @ApiResponse({ status: 200, description: 'Payment retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const payment = await this.paymentService.findOne(id);
    return { message: 'Payment retrieved successfully', data: payment };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update payment mode details' })
  @ApiParam({ name: 'id', type: String, description: 'Payment Snowflake ID' })
  @ApiResponse({ status: 200, description: 'Payment updated successfully.' })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
  ) {
    const payment = await this.paymentService.update(id, updatePaymentDto);
    return { message: 'Payment updated successfully', data: payment };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a payment mode' })
  @ApiParam({ name: 'id', type: String, description: 'Payment Snowflake ID' })
  @ApiResponse({ status: 200, description: 'Payment deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Payment not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.paymentService.remove(id);
    return { message: 'Payment deleted successfully', data: null };
  }
}
