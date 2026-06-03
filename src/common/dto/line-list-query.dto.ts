import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from './pagination.dto';

export class LineListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter lines by centre snowflake ID (master.centres.id)',
    example: '2058858609483202561',
  })
  @IsOptional()
  @IsString()
  centre_id?: string;
}
