import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Request DTO for linking an IVIS centre to its appointment-provider branch.
 *
 * No API key here: authentication uses a single global key held in the server
 * environment, so the operator only chooses WHICH branch this centre is. The
 * provider's response shapes live alongside the client, in
 * common/integrations/appointments/appointment.types.ts.
 */
export class LinkBranchDto {
  @ApiProperty({
    description:
      "The provider's branch code for this centre, chosen from GET /masters/centres/branches. Distinct from the IVIS centre code — both name the same physical centre.",
    example: 'SBX',
  })
  @IsString({ message: 'provider_branch_code must be a string' })
  @IsNotEmpty({ message: 'provider_branch_code is required' })
  @Matches(/^[A-Z0-9]{2,16}$/, {
    message: 'provider_branch_code must be uppercase alphanumeric',
  })
  provider_branch_code!: string;
}

export class VerifyBranchDto extends LinkBranchDto {}
