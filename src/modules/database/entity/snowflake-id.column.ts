import { PrimaryColumn } from 'typeorm';
import { bigintAsStringTransformer } from '../../../common/utils/bigint-string.transformer';

/** Primary key: snowflake ID (Postgres bigint, application string). Assigned via generateSnowflakeId(). */
export function SnowflakePrimaryColumn(): ReturnType<typeof PrimaryColumn> {
  return PrimaryColumn({
    type: 'bigint',
    transformer: bigintAsStringTransformer,
  });
}
