import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto.js';

/**
 * UpdateUserDto — all fields from CreateUserDto become optional.
 * user_id is excluded because it should not be updated after creation.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['user_id'] as const),
) {}
