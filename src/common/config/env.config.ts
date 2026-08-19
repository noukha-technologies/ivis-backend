import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Environment resolution for IVIS, in one place.
 *
 * One file: `.env`, git-ignored, never committed. `.env.example` is the
 * committed template that documents every key.
 *
 * Deployments do not ship a file at all — they set real environment variables
 * (Render, Docker, systemd), and dotenv never overwrites those, so the host
 * always wins over anything on disk.
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
 * The single env file. One file, always the same name.
 *
 * There used to be `.env.development` and `.env.production` layered under
 * `.env`, which meant a value could come from any of three places and the
 * answer depended on NODE_ENV. Real deployments set real environment
 * variables anyway, so the per-environment files only ever served local work
 * — and having two of them made it easy to edit the one that was not loaded.
 */
export function envFilePaths(): string[] {
  return ['.env'];
}

let loaded = false;

/**
 * Loads `.env` into process.env. Idempotent, so scripts that call it beside an
 * already-bootstrapped Nest app do not double-apply.
 *
 * dotenv never overwrites an existing process.env value, so real environment
 * variables (Render, Docker, CI, systemd) always beat the file. That is what
 * lets a deployment ship without an env file at all, and why NODE_ROLE is set
 * in the host environment rather than here.
 */
export function loadEnv(): AppEnvironment {
  if (loaded) return currentEnv();

  const path = resolve(process.cwd(), '.env');
  if (existsSync(path)) {
    dotenv.config({ path });
  }

  loaded = true;
  return currentEnv();
}

/**
 * Whether `.env` was actually found — used by the bootstrap log so a missing
 * file is visible at startup rather than surfacing later as a mystery
 * connection failure.
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
