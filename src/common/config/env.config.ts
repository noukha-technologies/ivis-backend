import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Environment resolution for IVIS, in one place.
 *
 * Every environment has its own file, so switching between them is a matter of
 * NODE_ENV rather than editing a shared `.env` in place:
 *
 *   .env.development   local development
 *   .env.production    production
 *   .env               optional local overrides, applied on top and never committed
 *
 * Files are layered: the environment file is read first, then `.env` overrides
 * individual keys from it. That lets a developer point at a different database
 * or provider host without editing the shared, committed environment file.
 *
 * `.env` is only layered onto DEVELOPMENT. Production must be configured by
 * its own file or by real environment variables — otherwise a developer's
 * leftover `.env` would silently supply a production run with local
 * credentials, which looks configured but is wrong.
 *
 * Both the Nest app (via ConfigModule) and the standalone ts-node scripts go
 * through this, so a migration and the running app can never disagree about
 * which database they are talking to.
 */

export type AppEnvironment = 'development' | 'production';

const VALID: AppEnvironment[] = ['development', 'production'];

/**
 * The active environment. Defaults to development: an unset NODE_ENV must
 * never be treated as production, where guards relax and live external
 * systems become writable.
 */
export function currentEnv(): AppEnvironment {
  const raw = process.env.NODE_ENV?.trim().toLowerCase();
  if (raw && (VALID as string[]).includes(raw)) {
    return raw as AppEnvironment;
  }
  return 'development';
}

export function isProduction(): boolean {
  return currentEnv() === 'production';
}

export function isDevelopment(): boolean {
  return currentEnv() === 'development';
}

/**
 * Env files for the active environment, most-specific last — the order
 * ConfigModule's `envFilePath` expects, and the order loadEnv() applies.
 */
export function envFilePaths(): string[] {
  const env = currentEnv();
  // See the note above: `.env` layers onto development only.
  return env === 'development' ? ['.env.development', '.env'] : [`.env.${env}`];
}

let loaded = false;

/**
 * Loads the environment files into process.env. Idempotent, so scripts that
 * call it alongside an already-bootstrapped Nest app do not double-apply.
 *
 * Later files win: `.env` overrides `.env.<environment>`. dotenv itself never
 * overwrites an existing process.env value, so real environment variables
 * (CI, Docker, systemd) always take precedence over any file — which is what
 * makes container deployments work without shipping env files at all.
 */
export function loadEnv(): AppEnvironment {
  if (loaded) return currentEnv();

  // Applied in reverse so the more specific file is read first and dotenv's
  // "first write wins" leaves `.env` overrides in place.
  for (const file of [...envFilePaths()].reverse()) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) {
      dotenv.config({ path });
    }
  }

  loaded = true;
  return currentEnv();
}

/**
 * Which env files were actually found on disk — used by the bootstrap log so a
 * misnamed or missing file is visible at startup rather than surfacing later
 * as a mystery connection failure.
 */
export function resolvedEnvFiles(): string[] {
  return envFilePaths().filter((file) =>
    existsSync(resolve(process.cwd(), file)),
  );
}

/**
 * Which half of the deployment this process is.
 *
 * `centre` is a box installed at an inspection centre: it owns cameras on the
 * local network, watches FTP folders, ingests appointments and pushes results
 * to the provider. `central` is the shared server every centre syncs against —
 * it holds the master data and serves the sync endpoints, and has none of that
 * local hardware.
 *
 * Defaults to `centre`, because that is the deployment there are many of and
 * the one that breaks visibly if it is wrong. A misconfigured central is the
 * quieter failure: it wastes work rather than stopping any.
 */
export type NodeRole = 'centre' | 'central';

export function nodeRole(): NodeRole {
  return process.env.NODE_ROLE?.trim().toLowerCase() === 'central'
    ? 'central'
    : 'centre';
}

/**
 * True on a centre box — the guard for every background worker that talks to
 * hardware or an external provider on a centre's behalf.
 *
 * Deliberately guards the WORKERS, not the modules. Central still serves the
 * same controllers: the admin UI reads cameras and appointments from it, and
 * the sync pull queries those very tables. Removing the modules would break
 * those reads; only the schedulers have no business running there.
 */
export function isCentreNode(): boolean {
  return nodeRole() === 'centre';
}
