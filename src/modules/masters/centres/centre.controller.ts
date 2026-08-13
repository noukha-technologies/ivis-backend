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
import { PermissionKeys } from '../../../common/constants/permissions';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ParseSnowflakeIdPipe } from '../../../common/pipes/parse-snowflake-id.pipe';

import { CentreService } from './services/centre.service';
import type { UserContext } from '../../../common/dto/auth.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  CreateCentreDto,
  UpdateCentreDto,
} from '../../../common/dto/centre.dto';
import {
  LinkBranchDto,
  VerifyBranchDto,
} from '../../../common/dto/appointment-branch.dto';
import { AppointmentBranchLinkService } from '../../../common/integrations/appointments/appointment-branch-link.service';
import { AppointmentLaneAssignmentService } from '../../../common/integrations/appointments/appointment-lane-assignment.service';

@ApiTags('Masters / Centres')
@Controller('masters/centres')
export class CentreController {
  constructor(
    private readonly centreService: CentreService,
    private readonly branchLinkService: AppointmentBranchLinkService,
    private readonly laneAssignmentService: AppointmentLaneAssignmentService,
  ) {}

  @Get('branches')
  @Permissions(PermissionKeys.MASTERS_VIEW)
  @ApiOperation({
    summary: 'Branches available at the appointment provider',
    description:
      'Live directory from GET /branches, annotated for the centre picker: which branches are already linked to another centre, and which may be linked in this environment. Unavailable branches are returned with a reason rather than hidden.',
  })
  @ApiQuery({
    name: 'centreId',
    required: false,
    description:
      'Exclude this centre from the taken-by check, so re-linking a centre to its own branch stays selectable.',
  })
  @ApiResponse({ status: 200, description: 'Branch directory retrieved.' })
  @ApiResponse({
    status: 400,
    description: 'Provider unreachable, or APPOINTMENT_API_KEY not configured.',
  })
  async listBranches(@Query('centreId') centreId?: string) {
    const data = await this.branchLinkService.listBranches(centreId);
    return { message: 'Branches retrieved successfully', data };
  }

  @Post(':id/verify-branch')
  @HttpCode(HttpStatus.OK)
  @Permissions(PermissionKeys.MASTERS_UPSERT)
  @ApiOperation({
    summary:
      'Verify an appointment-provider branch code and key without saving',
    description:
      "Calls GET /branches with the supplied key and confirms the branch code exists, returning its lanes and how they would map onto this centre's lines. Persists nothing.",
  })
  @ApiParam({ name: 'id', description: 'Centre snowflake id' })
  @ApiResponse({ status: 200, description: 'Branch verified.' })
  @ApiResponse({
    status: 400,
    description: 'Key rejected, or branch not available to this key.',
  })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async verifyBranch(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() dto: VerifyBranchDto,
  ) {
    const data = await this.branchLinkService.verify(
      id,
      dto.provider_branch_code,
    );
    return { message: 'Branch verified successfully', data };
  }

  @Post(':id/link-branch')
  @HttpCode(HttpStatus.OK)
  @Permissions(PermissionKeys.MASTERS_UPSERT)
  @ApiOperation({
    summary: 'Link this centre to its appointment-provider branch',
    description:
      'Verifies the branch code against GET /branches, then stores the key, branch code and lane-to-line mapping.',
  })
  @ApiParam({ name: 'id', description: 'Centre snowflake id' })
  @ApiResponse({ status: 200, description: 'Centre linked.' })
  @ApiResponse({
    status: 400,
    description: 'Key rejected, branch unavailable, or already linked.',
  })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async linkBranch(
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() dto: LinkBranchDto,
  ) {
    const data = await this.branchLinkService.link(
      id,
      dto.provider_branch_code,
    );
    return { message: 'Centre linked to appointment branch', data };
  }

  @Delete(':id/link-branch')
  @Permissions(PermissionKeys.MASTERS_UPSERT)
  @ApiOperation({
    summary: 'Unlink this centre from its appointment branch',
    description:
      'Clears the branch code and the lane-to-line mapping. The centre keeps operating; it simply stops reading and pushing provider data.',
  })
  @ApiParam({ name: 'id', description: 'Centre snowflake id' })
  @ApiResponse({ status: 200, description: 'Centre unlinked.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async unlinkBranch(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.branchLinkService.unlink(id);
    return { message: 'Centre unlinked from appointment branch', data: null };
  }

  @Get(':id/lanes')
  @Permissions(PermissionKeys.MASTERS_VIEW)
  @ApiOperation({
    summary: "The lanes this centre's branch offers",
    description:
      "Read live from the provider's branch directory, annotated with the line currently holding each lane and whether that line is locked by an active job. Backs the lane dropdown in Line Master. An unlinked centre returns an empty list rather than an error.",
  })
  @ApiParam({ name: 'id', description: 'Centre snowflake id' })
  @ApiResponse({ status: 200, description: 'Lanes retrieved.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async lanes(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.laneAssignmentService.listLanes(id);
    return { message: 'Lanes retrieved successfully', data };
  }

  @Get(':id/branch-status')
  @Permissions(PermissionKeys.MASTERS_VIEW)
  @ApiOperation({
    summary: 'Appointment-provider link state for this centre, plus any drift',
    description:
      'Reports whether the centre is linked and, if so, any divergence from GET /branches (withdrawn lanes, unmapped lines). Reports only — nothing is overwritten.',
  })
  @ApiParam({ name: 'id', description: 'Centre snowflake id' })
  @ApiResponse({ status: 200, description: 'Link status retrieved.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async branchStatus(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const data = await this.branchLinkService.status(id);
    return { message: 'Branch status retrieved successfully', data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new centre' })
  @ApiResponse({ status: 201, description: 'Centre created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 409, description: 'Duplicate code or centre_id.' })
  async create(
    @CurrentUser() actor: UserContext,
    @Body() createCentreDto: CreateCentreDto,
  ) {
    const centre = await this.centreService.create(createCentreDto, actor);
    return { message: 'Centre created successfully', data: centre };
  }

  @Get()
  @ApiOperation({
    summary: 'Retrieve all centres (paginated, filterable, sortable)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'name, code',
  })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'filters', required: false, type: String })
  @ApiQuery({ name: 'nonPaginated', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Centres list retrieved.' })
  async findAll(@Query() query: PaginationQueryDto) {
    const result = await this.centreService.findAll(query);
    return { message: 'Centres retrieved successfully', ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a centre by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Centre snowflake ID' })
  @ApiResponse({ status: 200, description: 'Centre retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async findOne(@Param('id', ParseSnowflakeIdPipe) id: string) {
    const centre = await this.centreService.findOne(id);
    return { message: 'Centre retrieved successfully', data: centre };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update centre details' })
  @ApiParam({ name: 'id', type: String, description: 'Centre snowflake ID' })
  @ApiResponse({ status: 200, description: 'Centre updated successfully.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate code.' })
  async update(
    @CurrentUser() actor: UserContext,
    @Param('id', ParseSnowflakeIdPipe) id: string,
    @Body() updateCentreDto: UpdateCentreDto,
  ) {
    const centre = await this.centreService.update(id, updateCentreDto, actor);
    return { message: 'Centre updated successfully', data: centre };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a centre' })
  @ApiParam({ name: 'id', type: String, description: 'Centre snowflake ID' })
  @ApiResponse({ status: 200, description: 'Centre deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Centre not found.' })
  async remove(@Param('id', ParseSnowflakeIdPipe) id: string) {
    await this.centreService.remove(id);
    return { message: 'Centre deleted successfully', data: null };
  }
}
