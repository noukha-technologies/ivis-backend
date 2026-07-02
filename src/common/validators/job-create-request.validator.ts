import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export interface JobCreateRequestShape {
  customer_id?: string;
  vehicle_record_id?: string;
  customer_name?: string;
  phone?: string;
  vehicle_no?: string;
  source?: string;
  payment?: {
    type?: string;
    mode?: string;
  };
}

export function isLegacyJobCreate(dto: JobCreateRequestShape): boolean {
  return !!(
    dto.customer_id &&
    dto.vehicle_record_id &&
    !dto.customer_name &&
    !dto.payment
  );
}

@ValidatorConstraint({ name: 'createJobRequest', async: false })
export class CreateJobRequestConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as JobCreateRequestShape;
    if (isLegacyJobCreate(dto)) {
      return !!(dto.customer_id && dto.vehicle_record_id);
    }
    return !!(
      dto.customer_name &&
      dto.phone &&
      dto.vehicle_no &&
      dto.payment?.type &&
      dto.payment?.mode
    );
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Provide legacy customer_id and vehicle_record_id with source, or full intake form fields.';
  }
}
