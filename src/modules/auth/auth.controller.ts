import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  BootstrapAdminDto,
  BootstrapAdminResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  RefreshTokenRequestDto,
} from '../../common/dto/auth.dto';
import type { UserContext } from '../../common/dto/auth.dto';
import { AuthService } from './service/auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  async login(@Body() body: LoginRequestDto): Promise<LoginResponseDto> {
    return await this.authService.login(body);
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
  async logout(@CurrentUser() user: UserContext): Promise<{ message: string }> {
    await this.authService.logout(user);
    return { message: 'Logged out successfully' };
  }
}
