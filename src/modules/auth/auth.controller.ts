import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestMetadata } from '../../common/decorators/request-metadata.decorator';
import {
  LoginRequestDto,
  LoginResponseDto,
  RefreshTokenRequestDto,
} from '../../common/dto/auth.dto';
import type { UserContext } from '../../common/dto/auth.dto';
import type { RequestMetadata as RequestMetadataType } from '../../common/utils/request-metadata.util';
import { AuthService } from './service/auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() body: LoginRequestDto,
    @RequestMetadata() metadata: RequestMetadataType,
  ): Promise<LoginResponseDto> {
    return this.authService.login(body, metadata);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async refresh(
    @Body() body: RefreshTokenRequestDto,
    @RequestMetadata() metadata: RequestMetadataType,
  ): Promise<LoginResponseDto> {
    return this.authService.refresh(body.refreshToken, metadata);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Logout and invalidate current session' })
  async logout(@CurrentUser() user: UserContext): Promise<{ message: string }> {
    await this.authService.logout(user);
    return { message: 'Logged out successfully' };
  }
}
