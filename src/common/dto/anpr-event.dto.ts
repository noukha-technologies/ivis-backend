import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsDateString,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

export class UpdateAnprEventDto {
    @ApiPropertyOptional({ example: '4816WA' })
    @IsOptional()
    @IsString()
    plateNumber?: string;

    @ApiPropertyOptional({ example: '2026-06-09T09:49:07.886Z' })
    @IsOptional()
    @IsDateString()
    captureTime?: string;

    @ApiPropertyOptional({ example: 85 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    confidenceScore?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    plateCharBelieve?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    laneNumber?: number | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    vehicleType?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    vehicleColour?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    plateColour?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    cameraCode?: string | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    centreCode?: string | null;
}
