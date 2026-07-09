<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">IVIS Backend — Vehicle Inspection Management System (Oman). NestJS 11 + TypeORM + PostgreSQL.</p>

## Description

IVIS (Integrated Vehicle Inspection System) is a vehicle inspection management platform for Oman covering the full inspection workflow: centres & lines, ANPR-driven vehicle capture, appointments, inspection jobs, ROP verification, payments, and role-based access control — across a **multi-location deployment**: one central Master Database plus one local database per inspection centre.

See [`CLAUDE.md`](./CLAUDE.md) for the detailed architecture reference (auth/RBAC internals, folder layout, layer flow, coding conventions). This README covers setup, environment configuration, and deployment.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL, TypeORM |
| Auth | JWT (access + refresh tokens), bcrypt |
| Validation | class-validator + class-transformer |
| API Docs | Swagger/OpenAPI |
| Scheduling | @nestjs/schedule |
| Camera Integration | Hikvision ANPR (FTP polling + HTTP push) |
| External APIs | ROP (Royal Oman Police) verification |
| Real-time | Socket.IO (+ Redis adapter) |
| OCR | Tesseract.js |
| Image processing | Sharp |

## Architecture at a Glance

```
Central / Master Server (NODE_ROLE=central)
    │  Master DB: all centres, all users, Super Admin lives here
    │
    │  ① Onboarding Sync (read-only pull, first login only)
    ▼
Centre Server (NODE_ROLE=centre)  — one per inspection centre
    Local DB: this centre's data only
```

- **Onboarding Sync**: a fresh centre server's local database is empty. The first Centre Admin login triggers a confirm → sync → complete handshake that pulls that centre's master data (lines, cameras, admin PCs, charges, roles, users) down from the central DB in one transaction. Every login after that is local-only — the central connection is never touched again for a `COMPLETED` centre.
- **Super Admin re-scoping**: a Super Admin is one identity (`access_scope: 'global'`), authored once centrally. When they log into an onboarded centre server, their identity is copied locally and **re-scoped** to that centre's own admin role — full access to that one centre, never global reach against a database that only holds one centre's data.
- **Role↔Centre is many-to-many**: one role (e.g. "Center Admin") can be linked to several centres via `role_centre_mappings`, instead of needing a duplicate role per centre.

Full design rationale, state machine, and scenario walkthroughs: [`ONBOARDING_DB_SYNC_ARCHITECTURE.md`](../ONBOARDING_DB_SYNC_ARCHITECTURE.md) (project root).

## Getting Started

### Prerequisites
- Node.js
- npm (this repo is npm-only — never pnpm/yarn; running pnpm prunes `node_modules`)
- PostgreSQL 16 (or use `npm run db:up` for a local Docker instance)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Fill in the values — see [Environment Variables](#environment-variables) below. At minimum for local development: `POSTGRES_*`, the JWT/encryption secrets, and `NODE_ROLE=centre` (the default).

### 3. Bootstrap the database
Schema creation runs automatically at app startup (see `SchemaBootstrapService` in `main.ts` — fails fast if it can't establish a clean schema, never serves traffic in an unknown DB state). To seed initial data:

- **A centre server**, or a standalone single-machine setup:
  ```bash
  npm run onboarding
  ```
  Runs migrations, then seeds a full-access `System Admin` role/user (`admin@opalivis.in` / `Admin@123`).

- **A Central / Super Admin node**:
  ```bash
  npm run onboarding:super-admin
  ```
  Runs migrations, then seeds a **global** `Super Admin` role/user (`superadmin@opalivis.in` / `SuperAdmin@123` — override via `--email=`/`--password=` or `SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD`). Set `NODE_ROLE=central` on this machine afterward.

Both scripts are idempotent — safe to re-run. **Change the default password after first login in both cases.**

### 4. Run the app
```bash
# development (watch mode)
npm run start:dev

# production
npm run build && npm run start:prod
```

API base: `http://localhost:{PORT}/{API_PREFIX}` — Swagger docs at `/api/docs` (development, or when `swagger.enabled` is set).

## Environment Variables

See `.env.example` for the canonical, commented list. Summary by section:

| Section | Vars | Notes |
|---|---|---|
| Application | `NODE_ENV`, `PORT`, `API_PREFIX`, `CORS_ORIGINS` | |
| PostgreSQL (this machine's local DB) | `POSTGRES_HOST/PORT/USER/PASSWORD/DB/SSLMODE` | Two schemas: `core` (operational data), `master` (reference/master data) |
| Node identity | `NODE_ROLE` | `centre` (default, today's only fully-wired deployment) or `central` — see [Node Roles](#node-roles--central-vs-centre) below |
| Central DB (Onboarding Sync) | `CENTRAL_DB_HOST/PORT/USER/PASSWORD/DB/SSLMODE` | **Must be a read-only Postgres role.** Only used by a `centre` node during onboarding sync — never written to |
| JWT / Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_REFRESH_EXPIRY_DAYS`, `REFRESH_TOKEN_ENCRYPT_KEY`, `RESET_TOKEN_SECRET` | All secrets must be ≥32 chars in production |
| ANPR — FTP watcher | `ANPR_FTP_WATCH_MODE`, `ANPR_FTP_WATCH_INTERVAL_MS`, `ANPR_FTP_MOUNT_BASE`, `ANPR_FTP_FALLBACK_SWEEP_MINUTES`, `ANPR_FTP_PROCESSED_STRATEGY`, `ANPR_FTP_INGEST_MODE`, `ANPR_FTP_OCR_DEBUG` | Hikvision FTP-pushed captures |
| ANPR — Webhook | `ANPR_WEBHOOK_ALIASES`, `ANPR_RAW_CAPTURE_DIR`, `ANPR_DAY_TIMEZONE`, `ANPR_DEBUG_DUMP_DIR` | Hikvision HTTP-push captures |
| ANPR — OCR | `ANPR_FTP_OCR_LANG`, `ANPR_FTP_MIN_CONFIDENCE` | Tesseract plate recognition |
| Appointments | `ONLINE_APPOINTMENT_API_URL`, `ONLINE_APPOINTMENT_API_KEY` | Third-party GET API; blank URL disables it (every job is Walk-in) |

**Never commit `.env`** — only `.env.example`.

### Node Roles — `central` vs `centre`

| | `centre` (default) | `central` |
|---|---|---|
| Status | Fully wired, today's only real deployment | Login path written, **not fully deployable yet** |
| Local DB starts as | Empty — populated via Onboarding Sync on first Centre Admin login | Seeded directly via `npm run onboarding:super-admin` |
| Super Admin login | Re-scoped to that centre's own admin role (`role_centre_mappings`), full access to that centre only | Would be a plain local login with real global scope |
| Blocker | None | Needs this node's default DataSource to point at a **writable** central Postgres connection — only a read-only `CENTRAL_DB_*` link exists today. Any Super Admin *write* operation from a Central node (create centre/role/user centrally) is out of scope until that exists |

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Dev server, watch mode |
| `npm run start:prod` | Run compiled `dist/main` |
| `npm run build` | Compile TypeScript |
| `npm run onboarding` | Bootstrap a fresh DB: run migrations + seed a centre-scoped `System Admin` |
| `npm run onboarding:super-admin` | Bootstrap a fresh DB: run migrations + seed a **global** `Super Admin` (Central node) |
| `npm run seed:central-super-admin` | Seed a global Super Admin into an **already-schema'd** central DB via writable `CENTRAL_DB_*`-shaped creds (does not run migrations) |
| `npm run migration:generate --name=X` | Generate a migration from entity changes |
| `npm run migration:run` / `migration:revert` | Run/revert pending migrations via the TypeORM CLI |
| `npm run migration:create-schema` | Run the `CreateSchema` migration explicitly |
| `npm run migration:alter` | Run the consolidated `AlterSchema` migration (idempotent — this is where ongoing schema changes are folded in, see `CLAUDE.md`) |
| `npm run migration:wipe` | **Destructive** — wipes data (`ALLOW_DATA_WIPE=true` required) |
| `npm run bootstrap:db` | Standalone DB bootstrap helper |
| `npm run db:up` / `db:down` / `db:reset` | Local Postgres via Docker |
| `npm run db:erd` / `db:erd:html` | Generate a database ERD (Markdown / HTML) from the entity graph |
| `npm run test` / `test:watch` / `test:cov` | Unit tests (Jest) |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:api` | API test script (bash) |
| `npm run test:lifecycle` | Job-lifecycle test script |
| `npm run lint` | ESLint (auto-fix) |

## Onboarding a New Machine

**Centre server** (day-to-day deployment):
1. Provision Postgres, set `POSTGRES_*` + `CENTRAL_DB_*` (read-only role) in `.env`, `NODE_ROLE=centre`.
2. Start the app — schema bootstraps automatically at startup.
3. A Centre Admin logs into the admin panel with their **central** credentials. They see a confirmation screen ("set up this device for Centre X?"), optionally select which Super Admin(s) should also get access to this centre, confirm — Onboarding Sync pulls that centre's data down in one transaction. Every login after that is local-only.

**Central / Super Admin node**:
1. Provision Postgres, set `POSTGRES_*` in `.env`.
2. `npm run onboarding:super-admin` — creates schema + a global Super Admin.
3. Set `NODE_ROLE=central`, start the app.
4. ⚠️ See [Node Roles](#node-roles--central-vs-centre) — write operations from this node aren't fully deployable yet; it currently only supports the bootstrap seed + acting as the read-only sync source for centre nodes.

## Auth & RBAC (summary)

```
User → Role → Permission (JSONB access matrix)
  │
  └── JWT (access + refresh) → AuthGuard builds resolvedPermissions
        └── PermissionsGuard checks @Permissions() against resolvedPermissions
```

- `Role.access_scope`: `global` (Super Admin, all centres) or `centre` (single centre's admin/user).
- `Role` ↔ `Centre` is many-to-many (`role_centre_mappings`) — one role can be linked to several centres.
- `is_center_admin` marks a centre-scoped role as that centre's admin tier.

Full detail (permission matrix shape, guard order, decorators, permission keys): see [`CLAUDE.md`](./CLAUDE.md).

## Modules

| Module | Purpose |
|---|---|
| `auth` | JWT login (incl. Onboarding Sync handshake), sessions, token refresh |
| `onboarding` | Central-DB sync engine, Super Admin re-scoping, `onboarding_status` state machine |
| `users` / `roles` / `permissions` | RBAC — user management, role CRUD (incl. centre-mapping), permission profiles |
| `masters` | Centres, Lines, Cameras, Vehicles, Tests, Charges, Payment Types, Admin PCs |
| `transactions` | ANPR captures, customers, payments, ROP verifications |
| `appointments` | Vehicle appointment scheduling |
| `jobs` | Inspection job tracking |
| `anpr` | Hikvision ANPR integration (FTP polling + HTTP push) |
| `payments` / `configuration(s)` | Payment records, centre-level configuration (sync mode, working hours, etc.) |
| `integrations` | External API integrations (ROP) |
| `database` | Entities, DAOs, migrations, dual-connection wiring (local + read-only central) |

## Testing

```bash
npm run test            # unit tests
npm run test:e2e        # end-to-end tests
npm run test:cov        # coverage report
npm run test:api        # API test script
npm run test:lifecycle  # job lifecycle test script
```

## Production Readiness

**Done / production-ready:**
- Core inspection workflow: ANPR capture → vehicle record → appointment → customer → job → payment.
- Full RBAC (JWT auth, permission matrix, role↔centre many-to-many).
- Onboarding Sync for `centre` nodes: confirm → sync → complete handshake, atomic state machine (`onboarding_status`, DB-level conditional claims — safe under concurrent logins), FK-dependency-ordered copy, rollback-safe on failure, stale-`IN_PROGRESS` recovery.
- Super Admin re-scoped login on an onboarded centre: source-of-truth password re-validation against central when reachable, offline fallback to the local hash when not.
- Schema bootstrap decoupled from login — runs once at startup, fails fast rather than serving traffic against an unknown schema.

**Known limitations / not yet built:**
- **`NODE_ROLE=central` is not a deployable node yet** — needs a writable central DB connection (today's `CENTRAL_DB_*` is read-only by design). Only the bootstrap seed script and the read-only sync-source role work today.
- **Bidirectional/ongoing sync is designed but not built** — transactional data (jobs, payments, ANPR captures) flowing centre → central (Manual "Sync" button vs. Automatic continuous mode, per centre configuration) is a future phase.
- **A Super Admin cannot bootstrap a bare centre server** — a Centre Admin must log in and complete onboarding first; there's no box-level "which centre am I" config independent of the logging-in user yet.
- Global masters (Vehicle, Test, PaymentType, unreferenced Permission/ChargeCategory) are not synced by Onboarding Sync.
- On-demand Role/Permission copies during sync are one-time snapshots, not live-linked — the future Data Sync phase must handle staleness for those.
- No schema-version compatibility check between a centre's local app build and the central DB at sync time.
- Read-only enforcement on the central connection is an infra responsibility (the Postgres role itself), not enforced in application code.

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- Swagger/OpenAPI docs: `/api/docs` (this app, development mode)
- [`CLAUDE.md`](./CLAUDE.md) — architecture & coding conventions reference
- [`ONBOARDING_DB_SYNC_ARCHITECTURE.md`](../ONBOARDING_DB_SYNC_ARCHITECTURE.md) — multi-location DB sync design

## License

UNLICENSED — private project.
