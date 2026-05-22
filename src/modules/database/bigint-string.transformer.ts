import type { ValueTransformer } from 'typeorm';

/** Maps Postgres bigint columns to string in application code (avoids JS precision loss). */
export const bigintAsStringTransformer: ValueTransformer = {
  to: (value?: string | null) => value ?? null,
  from: (value?: string | number | bigint | null) =>
    value === null || value === undefined ? value : String(value),
};
