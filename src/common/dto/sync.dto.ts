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

/**
 * What the centre declares about itself when opening a run.
 *
 * Exists because schema_version was previously a purely local value: nothing
 * was exchanged, so a centre running an old build silently dropped every
 * column central had added and still reported SUCCESS. Declaring the version
 * and the entity list up front turns that silent data loss into a refusal.
 */
export class SyncStartRunDto {
  @ApiPropertyOptional({
    description:
      "The centre's ALTER_SCHEMA_VERSION. Omitted by pre-handshake builds, which are treated as unknown rather than rejected.",
  })
  @IsOptional()
  @IsInt()
  schemaVersion?: number;

  @ApiPropertyOptional({
    description:
      'Entity keys this centre knows how to sync, so central can report tables the centre would never ask for.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entityKeys?: string[];
}

export class SyncStartRunResponseDto {
  @ApiProperty()
  runId!: string;

  @ApiPropertyOptional({
    description: "Central's own ALTER_SCHEMA_VERSION, for the centre's logs.",
  })
  centralSchemaVersion?: number;

  @ApiPropertyOptional({
    description:
      'false when the centre is behind central and would silently miss columns. The centre must abort the run.',
  })
  compatible?: boolean;

  @ApiPropertyOptional({
    description:
      'Human-readable schema differences — version gap, and entities either side does not know.',
    type: [String],
  })
  schemaDrift?: string[];
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
