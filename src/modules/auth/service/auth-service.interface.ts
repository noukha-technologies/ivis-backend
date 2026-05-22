import {
  IdentityAccessTokenVerificationRequest,
  IdentityRefresh,
  IdentityRequest,
  IdentityVerificationRequest,
  LoginRequestDto,
  LoginResponseDto,
  UserCxt,
  VerifyOtpResponseDto,
} from "src/common/dto/auth.dto";
import { RequestMetata } from "src/common/utils/util";

export interface IAuthService {
  login(
    request: LoginRequestDto,
    requestMetadata: RequestMetata
  ): Promise<LoginResponseDto>;
  refresh(
    userCxt: UserCxt,
    requestMetadata: RequestMetata,
    isMobile: boolean
  ): Promise<LoginResponseDto>;
  logout(userCxt: UserCxt, isMobile: boolean): Promise<void>;
  forgetPassword(emailId: string): Promise<void>;
  verifyConfirmationCode(
    emailId: string,
    confirmationCode: string
  ): Promise<VerifyOtpResponseDto>;
  updatePassword(
    emailId: string,
    password: string,
    resetToken: string
  ): Promise<void>;
  requestIdentity(request: IdentityRequest): Promise<void>;
  verifyIdentity(
    request: IdentityVerificationRequest,
    requestMetadata: RequestMetata
  ): Promise<LoginResponseDto>;
  verifyIdentityWithAccessToken(
    request: IdentityAccessTokenVerificationRequest,
    requestMetadata: RequestMetata
  ): Promise<LoginResponseDto>;
  refreshIdentity(
    refeshdetails: IdentityRefresh,
    requestMetadata: RequestMetata
  ): Promise<LoginResponseDto>;
}
