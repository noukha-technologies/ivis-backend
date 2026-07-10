import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SYNC_STATUS_VALUES, SyncStatusValue } from '../../modules/database/entity/sync-state.entity';

export class SyncStatusDto {
  @ApiPropertyOptional({ description: 'Last successful (or partial) pull cursor' })
  last_pulled_at?: Date | null;

  @ApiPropertyOptional({ description: 'Last successful (or partial) push cursor' })
  last_pushed_at?: Date | null;

  @ApiPropertyOptional({ enum: SYNC_STATUS_VALUES })
  last_sync_status?: SyncStatusValue | null;

  @ApiPropertyOptional()
  last_error?: string | null;
}

export class SyncTriggerResponseDto {
  @ApiProperty({ enum: ['SUCCESS', 'PARTIAL', 'FAILED'] })
  status!: 'SUCCESS' | 'PARTIAL' | 'FAILED';

  @ApiProperty({
    description: 'Rows pulled from central per entity',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  pulled!: Record<string, number>;

  @ApiProperty({
    description: 'Rows pushed to central per entity',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  pushed!: Record<string, number>;

  @ApiPropertyOptional()
  error?: string;
}
