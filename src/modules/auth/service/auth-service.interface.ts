import {
  LoginRequestDto,
  LoginResponseDto,
  UserContext,
} from '../../../common/dto/auth.dto.js';
import { RequestMetadata } from '../../../common/utils/request-metadata.util.js';

export interface IAuthService {
  login(request: LoginRequestDto, metadata: RequestMetadata): Promise<LoginResponseDto>;
  refresh(refreshToken: string, metadata: RequestMetadata): Promise<LoginResponseDto>;
  logout(userContext: UserContext): Promise<void>;
  buildUserContext(userId: string, accessJti: string): Promise<UserContext | null>;
}
