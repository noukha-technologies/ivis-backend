import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

interface CentreLineInput {
  center_id?: string;
  line_id?: string;
  line_ids?: string[];
}

export function resolveUserLineIds(dto: CentreLineInput): string[] {
  if (dto.line_ids !== undefined) {
    if (!Array.isArray(dto.line_ids)) {
      return [];
    }
    return dto.line_ids
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean);
  }
  if (typeof dto.line_id === 'string' && dto.line_id.trim()) {
    return [dto.line_id.trim()];
  }
  return [];
}

@ValidatorConstraint({ name: 'userCreateCentreLine', async: false })
export class UserCreateCentreLineConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    return resolveUserLineIds(args.object as CentreLineInput).length > 0;
  }

  defaultMessage(): string {
    return 'At least one line must be selected';
  }
}

@ValidatorConstraint({ name: 'userCentreLinePair', async: false })
export class UserCentreLinePairConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CentreLineInput;
    const hasCentreField = dto.center_id !== undefined;
    const hasLinesField = dto.line_ids !== undefined || dto.line_id !== undefined;

    if (!hasCentreField && !hasLinesField) {
      return true;
    }

    if (dto.line_ids !== undefined && !Array.isArray(dto.line_ids)) {
      return false;
    }

    if (
      Array.isArray(dto.line_ids) &&
      dto.line_ids.some((id) => typeof id !== 'string' || !id.trim())
    ) {
      return false;
    }

    const centerId = typeof dto.center_id === 'string' ? dto.center_id.trim() : '';
    const lineIds = resolveUserLineIds(dto);

    // Structural invariant only: a line can't be assigned without a centre.
    // The "Centre User must have a line" rule is role-based and enforced in
    // the service (a DTO validator can't see the role's scope).
    if (!centerId && lineIds.length > 0) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CentreLineInput;

    if (dto.line_ids !== undefined && !Array.isArray(dto.line_ids)) {
      return 'line_ids must be an array';
    }

    if (
      Array.isArray(dto.line_ids) &&
      dto.line_ids.some((id) => typeof id !== 'string' || !id.trim())
    ) {
      return 'each line_id must be a string';
    }

    const centerId = typeof dto.center_id === 'string' ? dto.center_id.trim() : '';
    const lineIds = resolveUserLineIds(dto);

    if (!centerId && lineIds.length > 0) {
      return 'center_id is required when assigning lines';
    }

    return 'Invalid centre and line assignment';
  }
}
