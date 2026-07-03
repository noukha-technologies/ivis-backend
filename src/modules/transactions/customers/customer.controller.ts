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
import {
  CreateCustomerDto,
  UpdateCustomerDto,
} from '../../../common/dto/customer.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { UserContext } from '../../../common/dto/auth.dto';
import { CustomerService } from './services/customer.service';

@ApiTags('Transactions / Customers')
@Controller('transactions/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a customer record' })
  @ApiResponse({ status: 201, description: 'Customer created successfully.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createDto: CreateCustomerDto,
  ) {
    const data = await this.customerService.create(createDto, actor);
    return { message: 'Customer created successfully', data };
  }

  @Get()
  @ApiOperation({
    summary: 'Retrieve customers (paginated, filterable, sortable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Customers retrieved successfully.',
  })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.customerService.findAll(query);
    return { message: 'Customers retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve customer by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Customer snowflake ID' })
  @ApiResponse({ status: 200, description: 'Customer retrieved successfully.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.customerService.findOne(id);
    return { message: 'Customer retrieved successfully', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Customer snowflake ID' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully.' })
  async update(
    @CurrentUser() actor: UserContext,
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateDto: UpdateCustomerDto,
  ) {
    const data = await this.customerService.update(id, updateDto, actor);
    return { message: 'Customer updated successfully', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete customer' })
  @ApiParam({ name: 'id', type: String, description: 'Customer snowflake ID' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.customerService.remove(id);
    return { message: 'Customer deleted successfully', data: null };
  }
}
