import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@Entity({ name: 'users', schema: 'users' })
export class User {
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: 'd3b07384-d113-4956-a5e2-aa59c256037a',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Unique numeric user identifier',
    example: 1001,
  })
  @Column({ type: 'integer', unique: true, nullable: false })
  @Index('IDX_USER_USER_ID', { unique: true })
  user_id!: number;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @Column({ type: 'varchar', nullable: false })
  user_name!: string;

  @ApiProperty({
    description: 'Email address of the user',
    example: 'john.doe@example.com',
  })
  @Column({ type: 'varchar', unique: true, nullable: false })
  @Index('IDX_USER_EMAIL', { unique: true })
  email!: string;

  @ApiProperty({
    description: 'Role of the user',
    example: 'admin',
  })
  @Column({ type: 'varchar', nullable: false })
  role!: string;

  @ApiPropertyOptional({
    description: 'Center / location of the user',
    example: 'Center-A',
  })
  @Column({ type: 'varchar', nullable: true })
  center?: string;

  @ApiPropertyOptional({
    description: 'Production line assigned to the user',
    example: 'Line-1',
  })
  @Column({ type: 'varchar', nullable: true })
  line?: string;

  @ApiProperty({
    description: 'Record creation timestamp',
    example: '2026-05-21T12:00:00.000Z',
  })
  @CreateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  created_at!: Date;

  @ApiProperty({
    description: 'Record last update timestamp',
    example: '2026-05-21T12:00:00.000Z',
  })
  @UpdateDateColumn({ type: 'timestamp', default: () => 'NOW()' })
  updated_at!: Date;

  @ApiProperty({
    description: 'Whether the user has been deleted',
    example: false,
  })
  @Column({ type: 'boolean', default: false })
  is_deleted!: boolean;
}
