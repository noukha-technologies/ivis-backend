import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AppConstants } from "src/common/constants/app.constants";
import { PermissionKeys } from "src/common/constants/permissions";
import { Permissions } from "src/common/decorators/permissions.decorator";
import { PermissionDto } from "src/common/dto/permissions.dto";
import { IPermissionsService } from "./service/permission-service.interface";

@ApiTags("Permissions")
@Controller("permissions")
export class PermissionsController {
  constructor(
    @Inject(AppConstants.PERMISSION_SERVICE_TOKEN)
    private readonly permissionService: IPermissionsService
  ) {}

  @Get()
  @Permissions(PermissionKeys.PERMISSIONS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get All Permissions",
    description: "Fetches all permission details",
  })
  @ApiBearerAuth('Bearer')
  @ApiQuery({
    name: "includeInActive",
    type: Boolean,
    required: false,
    description:
      "Flag determines whether to fetch inactive permissions are not",
  })
  @ApiOkResponse({
    description: "Permission Details",
    type: PermissionDto,
  })
  async getAllPermissions(
    @Query("includeInActive") includeInActive: boolean = false
  ) {
    return this.permissionService.getAllPermissions(includeInActive);
  }
}
