import { registerDecorator, ValidationOptions } from 'class-validator';
import { AreValidPermissionsValidator } from '../../modules/database/permission-validator.service';

export function AreValidPermissions(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: AreValidPermissionsValidator,
    });
  };
}
