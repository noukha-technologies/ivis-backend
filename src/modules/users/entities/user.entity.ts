import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('users')
export class User {
  @ApiProperty({ example: 'd3b07384-d113-4956-a5e2-aa59c256037a' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  @Column({ unique: true })
  email!: string;

  @Column({ select: false, nullable: true }) // Password won't be returned in queries by default
  password?: string;

  @ApiProperty({ example: 'John' })
  @Column({ nullable: true })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @Column({ nullable: true })
  lastName!: string;

  @ApiProperty({ example: true })
  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
