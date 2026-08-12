import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/** One entity's chunk of rows being pushed centre → central. See Database_sync_arch_replan.md §3a/§7. */
export class SyncPushChunkDto {
  @ApiProperty()
  @IsString()
  runId!: string;

  @ApiProperty()
  @IsString()
  entityKey!: string;

  @ApiProperty()
  @IsInt()
  chunkIndex!: number;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  @IsArray()
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}

export class SyncPushChunkResponseDto {
  @ApiProperty()
  accepted!: number;

  @ApiProperty()
  hasMore!: boolean;

  @ApiPropertyOptional()
  nextChunkIndex?: number;
}

/** Requests the next chunk of one entity's rows, central → centre. */
export class SyncPullChunkDto {
  @ApiProperty()
  @IsString()
  runId!: string;

  @ApiProperty()
  @IsString()
  entityKey!: string;

  @ApiPropertyOptional({
    description: 'ISO timestamp cursor — rows strictly newer than this.',
  })
  @IsOptional()
  @IsDateString()
  cursor?: string;
}

export class SyncPullChunkResponseDto {
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  rows!: Record<string, unknown>[];

  @ApiProperty()
  hasMore!: boolean;

  @ApiPropertyOptional()
  nextCursor?: string | null;
}

export class SyncStartRunResponseDto {
  @ApiProperty()
  runId!: string;
}

export class SyncRunLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  started_at!: Date;

  @ApiPropertyOptional()
  finished_at?: Date | null;

  @ApiProperty({ enum: ['IN_PROGRESS', 'SUCCESS', 'PARTIAL', 'FAILED'] })
  status!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  pushed!: Record<string, number>;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  pulled!: Record<string, number>;

  @ApiPropertyOptional()
  error?: string | null;
}
