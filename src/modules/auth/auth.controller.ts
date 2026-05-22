import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AppConstants } from "src/common/constants/app.constants";
import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { Public } from "src/common/decorators/public-route.decorator";
import { RequestMetadata } from "src/common/decorators/request-metadata.decorator";
import {
  ChangePasswordRequestDto,
  IdentityAccessTokenVerificationRequest,
  ForgetPasswordRequestDto,
  IdentityRefresh,
  IdentityRequest,
  IdentityVerificationRequest,
  LoginRequestDto,
  LoginResponseDto,
  UserCxt,
  VerfiyOtpRequestDto,
  VerifyOtpResponseDto,
} from "src/common/dto/auth.dto";
import { RequestMetata } from "src/common/utils/util";
import { IAuthService } from "./service/auth-service.interface";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AppConstants.AUTH_SERVICE_TOKEN)
    private readonly authService: IAuthService
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logs in user",
    description: "endpoint to log in to application",
  })
  @ApiBody({
    type: LoginRequestDto,
    description: "Login request details",
  })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: "Successfully logged in user details",
  })
  async login(
    @Body() body: LoginRequestDto,
    @RequestMetadata() reqMetadata: RequestMetata
  ) {
    return this.authService.login(body, reqMetadata);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Refresh session",
    description: "endpoint to refresh session",
  })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: "Successfully refreshed session details",
  })
  @ApiBearerAuth("Bearer")
  async refresh(
    @CurrentUser() userCxt: UserCxt,
    @RequestMetadata() reqMetadata: RequestMetata,
    @Headers(AppConstants.USER_CURRENT_VIEW) currentView: string
  ) {
    return this.authService.refresh(
      userCxt,
      reqMetadata,
      currentView == AppConstants.MOBILE_VIEW
    );
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logout user",
    description: "endpoint to logout user from application",
  })
  @ApiBearerAuth("Bearer")
  async logout(
    @CurrentUser() userCxt: UserCxt,
    @Headers(AppConstants.USER_CURRENT_VIEW) currentView: string
  ) {
    return this.authService.logout(
      userCxt,
      currentView == AppConstants.MOBILE_VIEW
    );
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Forget password",
    description: "endpoint to request for forget password request",
  })
  @ApiBody({
    type: ForgetPasswordRequestDto,
    description: "Login request details",
  })
  async forgetPassword(@Body() body: ForgetPasswordRequestDto) {
    return this.authService.forgetPassword(body.emailId);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("forgot-password/verify-code")
  @ApiOperation({
    summary: "Verify Confirmation code",
    description: "endpoint to verify confirmation code for forgot password",
  })
  @ApiBody({
    type: VerfiyOtpRequestDto,
    description: "Confirmation Code verify request details",
  })
  @ApiOkResponse({
    type: VerifyOtpResponseDto,
    description: "Confirmation Code success response",
  })
  async verifyConfirmationCode(@Body() body: VerfiyOtpRequestDto) {
    return this.authService.verifyConfirmationCode(
      body.emailId,
      body.confirmationCode
    );
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("change-password")
  @ApiOperation({
    summary: "Change password",
    description: "endpoint to change password",
  })
  @ApiBody({
    type: ChangePasswordRequestDto,
    description: "Change password request details",
  })
  async resetPassword(@Body() body: ChangePasswordRequestDto) {
    return this.authService.updatePassword(
      body.emailId,
      body.password,
      body.resetToken
    );
  }

  @Public()
  @Post("request-identity")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Request Identity",
    description:
      "For MOBILE: checks user eligibility (e.g. gig partner vs other roles). Does not send WhatsApp OTP; use POST /otp_authentication for delivery. Use verify-identity with otp to log in.",
  })
  @ApiBody({
    type: IdentityRequest,
    description: "Identity request details (provider, mobileNo for MOBILE)",
  })
  @ApiOkResponse()
  async requestIdentity(@Body() body: IdentityRequest) {
    return this.authService.requestIdentity(body);
  }

  @Public()
  @Post("verify-identity")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify Identity",
    description: "endpoint to verify identity",
  })
  @ApiBody({
    type: IdentityVerificationRequest,
    description: "Identity verify details",
  })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: "Successfully logged in user details",
  })
  async verifyIdentity(
    @Body() body: IdentityVerificationRequest,
    @RequestMetadata() requestMetadata: RequestMetata
  ) {
    return this.authService.verifyIdentity(body, requestMetadata);
  }

  @Public()
  @Post("verify-identity-by-access-token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify Identity By Access Token",
    description: "endpoint to verify identity using access token",
  })
  @ApiBody({
    type: IdentityAccessTokenVerificationRequest,
    description: "Identity access token verify details",
  })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: "Successfully validated identity details",
  })
  async verifyIdentityByAccessToken(
    @Body() body: IdentityAccessTokenVerificationRequest,
    @RequestMetadata() requestMetadata: RequestMetata
  ) {
    return this.authService.verifyIdentityWithAccessToken(body, requestMetadata);
  }

  @Public()
  @Post("refresh-identity")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Refresh session identity",
    description: "endpoint to refresh session identity",
  })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: "Successfully refreshed session details",
  })
  @ApiBody({
    type: IdentityRefresh,
    description: "Identity Refresh details",
  })
  async refreshIdentity(
    @Body() refeshdetails: IdentityRefresh,
    @RequestMetadata() requestMetadata: RequestMetata
  ) {
    return this.authService.refreshIdentity(refeshdetails, requestMetadata);
  }
}
