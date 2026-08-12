import {
  currentEnv,
  loadEnv,
  resolvedEnvFiles,
} from '../common/config/env.config';

loadEnv();

import {
  writableNonProductionBranches,
  appointmentBaseUrl,
} from '../common/integrations/appointments/appointment.constants';

/**
 * Prints the resolved configuration for the active environment, so you can see
 * exactly which database and provider host you are pointed at BEFORE running a
 * migration or starting the app against it.
 *
 *   npm run env:check                        → development
 *   NODE_ENV=production npm run env:check    → production
 *
 * Secrets are shown only as present/absent, never printed.
 */

const env = currentEnv();
const isProd = env === 'production';

function shown(value: string | undefined): string {
  const v = value?.trim();
  return v ? v : '(unset)';
}

function secret(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) return '✗ not set';
  return `✓ set (${v.length} chars)`;
}

const REQUIRED = [
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_DB',
  'API_PREFIX',
  'PORT',
];

const SECRETS = [
  'POSTGRES_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'REFRESH_TOKEN_ENCRYPT_KEY',
  'RESET_TOKEN_SECRET',
];

console.log(`\n  Environment : ${env}`);
console.log(
  `  Env files   : ${resolvedEnvFiles().join(', ') || '(none found — using process env only)'}`,
);

console.log('\n  Database');
console.log(
  `    host      : ${shown(process.env.POSTGRES_HOST)}:${shown(process.env.POSTGRES_PORT)}`,
);
console.log(`    database  : ${shown(process.env.POSTGRES_DB)}`);
console.log(`    user      : ${shown(process.env.POSTGRES_USER)}`);
console.log(`    sslmode   : ${shown(process.env.POSTGRES_SSLMODE)}`);

console.log('\n  Appointment provider');
console.log(`    base url  : ${appointmentBaseUrl()}`);
console.log(
  `    writable  : ${isProd ? 'all branches (production)' : writableNonProductionBranches().join(', ')}`,
);

console.log('\n  Server');
console.log(`    port      : ${shown(process.env.PORT)}`);
console.log(`    prefix    : ${shown(process.env.API_PREFIX)}`);
console.log(
  `    cors      : ${env === 'development' ? 'any origin (development)' : shown(process.env.CORS_ORIGINS)}`,
);
console.log(
  `    swagger   : ${env === 'development' ? 'enabled' : 'disabled'}`,
);

console.log('\n  Secrets');
for (const name of SECRETS) {
  console.log(`    ${name.padEnd(26)}: ${secret(name)}`);
}

const missing = [
  ...REQUIRED.filter((k) => !process.env[k]?.trim()),
  ...SECRETS.filter((k) => !process.env[k]?.trim()),
];

if (missing.length > 0) {
  console.log(`\n  ✗ Missing ${missing.length} required value(s):`);
  for (const name of missing) console.log(`      ${name}`);
  console.log(
    `\n  Set them in .env.${env}, in an uncommitted .env, or in the deployment environment.\n`,
  );
  process.exit(1);
}

console.log('\n  ✓ All required configuration present.\n');
