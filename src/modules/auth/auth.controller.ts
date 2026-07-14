import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionKeys } from '../../common/constants/permissions';
import {
  BootstrapAdminDto,
  BootstrapAdminResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  RefreshTokenRequestDto,
} from '../../common/dto/auth.dto';
import type { UserContext } from '../../common/dto/auth.dto';
import { getRequestMetadata } from '../../common/utils/request-metadata.util';
import { AuditService } from '../audit-logs/service/audit.service';
import { AuthService } from './service/auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Bootstrap the first admin user with all permissions (one-time, only on an empty system)',
  })
  @ApiBody({ type: BootstrapAdminDto })
  @ApiOkResponse({ type: BootstrapAdminResponseDto })
  async bootstrap(@Body() body: BootstrapAdminDto) {
    const data = await this.authService.bootstrapAdmin(body);
    return { message: 'Admin bootstrapped successfully', data };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() body: LoginRequestDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    const result = await this.authService.login(body);
    if (result.status === 'SUCCESS' && result.user) {
      const meta = getRequestMetadata(req);
      await this.auditService.log({
        action: 'LOGIN',
        description: 'Logged in',
        userId: result.user.id,
        userName: result.user.user_name,
        ipAddress: meta.ipAddress,
        userAgent: meta.browser !== 'unknown' ? meta.browser : undefined,
      });
    }
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async refresh(
    @Body() body: RefreshTokenRequestDto,
  ): Promise<LoginResponseDto> {
    return await this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Logout and invalidate current session' })
  async logout(
    @CurrentUser() user: UserContext,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.authService.logout(user);
    const meta = getRequestMetadata(req);
    await this.auditService.log({
      action: 'LOGOUT',
      description: 'Logged out',
      userId: user.user.id,
      userName: user.user.user_name,
      ipAddress: meta.ipAddress,
      userAgent: meta.browser !== 'unknown' ? meta.browser : undefined,
    });
    return { message: 'Logged out successfully' };
  }

  @Post('impersonate/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer')
  @Permissions(PermissionKeys.USER_IMPERSONATE)
  @ApiOperation({ summary: 'Super Admin: log in as a Centre Admin' })
  @ApiOkResponse({ type: LoginResponseDto })
  async impersonate(
    @CurrentUser() actor: UserContext,
    @Param('userId') userId: string,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    const result = await this.authService.impersonate(actor, userId);
    if (result.status === 'SUCCESS' && result.user) {
      const meta = getRequestMetadata(req);
      await this.auditService.log({
        action: 'LOGIN',
        description: `Logged in as ${result.user.user_name} (impersonation)`,
        userId: result.user.id,
        userName: result.user.user_name,
        ipAddress: meta.ipAddress,
        userAgent: meta.browser !== 'unknown' ? meta.browser : undefined,
        after: {
          impersonated_by: actor.user.id,
          impersonated_by_name: actor.user.user_name,
        },
      });
    }
    return result;
  }
}
