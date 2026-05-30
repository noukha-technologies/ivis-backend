import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertPermissionDto {
  @ApiProperty({ description: 'The unique key for the permission' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ description: 'Description of the permission' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ description: 'Whether the permission is active', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PermissionDto extends UpsertPermissionDto {
  @ApiProperty({ description: 'The unique identifier of the permission' })
  id!: string;
  
  @ApiProperty({ description: 'Created by user id', required: false })
  created_by?: string;

  @ApiProperty({ description: 'Creation date' })
  created_at!: Date;

  @ApiProperty({ description: 'Update date' })
  updated_at!: Date;
}
