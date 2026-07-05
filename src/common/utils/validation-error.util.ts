import { UnprocessableEntityException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface FieldValidationError {
  field: string;
  message: string;
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldValidationError[] {
  const result: FieldValidationError[] = [];

  for (const error of errors) {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        result.push({ field, message });
      }
    }

    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }

  return result;
}

export function buildValidationException(
  errors: ValidationError[],
): UnprocessableEntityException {
  const fieldErrors = flattenValidationErrors(errors);

  return new UnprocessableEntityException({
    message: 'Validation failed',
    errors: fieldErrors,
    error: fieldErrors.map(({ message }) => message),
  });
}
