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
import { CreatePaymentTypeDto, UpdatePaymentTypeDto } from '../../../common/dto/payment-type.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaymentTypeService } from './service/payment-type.service';

@ApiTags('Masters / Payment Types')
@Controller('masters/payment-types')
export class PaymentTypeController {
  constructor(private readonly paymentTypeService: PaymentTypeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new payment type' })
  @ApiResponse({ status: 201, description: 'Payment type created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() dto: CreatePaymentTypeDto,
  ) {
    const paymentType = await this.paymentTypeService.create(dto, actor);
    return { message: 'Payment type created successfully', data: paymentType };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all payment types (paginated, filterable, sortable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Payment types retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.paymentTypeService.findAll(query);
    return { message: 'Payment types retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a payment type by snowflake ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Payment type retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Payment type not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const paymentType = await this.paymentTypeService.findOne(id);
    return { message: 'Payment type retrieved successfully', data: paymentType };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a payment type' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Payment type updated successfully.' })
  @ApiResponse({ status: 404, description: 'Payment type not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() dto: UpdatePaymentTypeDto,
  ) {
    const paymentType = await this.paymentTypeService.update(id, dto);
    return { message: 'Payment type updated successfully', data: paymentType };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a payment type' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Payment type deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Payment type not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.paymentTypeService.remove(id);
    return { message: 'Payment type deleted successfully', data: null };
  }
}
