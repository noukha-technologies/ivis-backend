import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { In, Repository } from 'typeorm';
import { Permission } from './entity/permissions.entity';

@ValidatorConstraint({ name: 'AreValidPermissions', async: true })
@Injectable()
export class AreValidPermissionsValidator implements ValidatorConstraintInterface {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  async validate(values: string[], _: ValidationArguments): Promise<boolean> {
    if (!Array.isArray(values) || values.length === 0) {
      return true;
    }

    const uniqueKeys = [...new Set(values)];

    const count = await this.permissionRepo.count({
      where: {
        key: In(uniqueKeys),
        isActive: true,
        is_deleted: false,
      },
    });

    return count === uniqueKeys.length;
  }

  defaultMessage(_: ValidationArguments): string {
    return 'One or more permission keys are invalid or inactive';
  }
}
