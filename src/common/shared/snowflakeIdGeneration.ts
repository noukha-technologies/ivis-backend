import Snowflakify from 'snowflakify';

/** Twitter/X epoch (2010-11-04) — common default for snowflake IDs. */
const DEFAULT_EPOCH = 1288834974657;

const snowflakify = new Snowflakify({ epoch: DEFAULT_EPOCH });

/**
 * Generates a unique 64-bit snowflake ID as a decimal string (safe for JSON and Postgres bigint).
 */
export function generateSnowflakeId(): string {
  return snowflakify.nextId().toString();
}
