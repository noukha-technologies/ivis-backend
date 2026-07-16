# IVIS Backend

## Project Description

IVIS (Integrated Vehicle Inspection System) is a vehicle inspection management platform for Oman. It manages the complete vehicle inspection workflow:

- **Centres & Lines** — Inspection centres with multiple testing lines
- **Appointments** — Vehicle appointment scheduling
- **ANPR Integration** — Hikvision camera integration for automatic number plate recognition (FTP + HTTP push methods)
- **Jobs** — Inspection job tracking from vehicle arrival to completion
- **ROP Verification** — Integration with Royal Oman Police for vehicle/owner verification
- **Payments** — Payment processing for inspection fees
- **Role-Based Access** — Multi-role permission system with granular module/action control

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11 |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL |
| ORM | TypeORM |
| Auth | JWT (access + refresh tokens) |
| Validation | class-validator + class-transformer |
| API Docs | Swagger/OpenAPI |
| Scheduling | @nestjs/schedule (cron jobs) |
| Camera Integration | Hikvision ANPR (FTP polling + HTTP push) |
| External APIs | ROP (Royal Oman Police) verification |

## Authentication & Authorization System

### Architecture

```
User → Role → Permission (access matrix)
  │
  └── JWT token contains: userId, sessionId
        │
        └── AuthGuard validates token → builds userContext with resolvedPermissions
              │
              └── PermissionsGuard checks @Permissions() decorator against resolvedPermissions
```

### Entities (schema: `core`)

| Entity | Purpose |
|--------|---------|
| `User` | User account with `role_id` FK, optional `center_id` for centre-scoped users |
| `Role` | Named role with `permission_id` FK pointing to access matrix |
| `Permission` | Access profile with JSONB `access` field (RoleAccessMatrix) |
| `UserSession` | Active JWT sessions for token validation |

### Permission Matrix Structure

```typescript
type RoleAccessMatrix = {
  dashboard: ModuleCrudFlags;                              // { create, edit, view }
  appointments: ModuleWithSubmodules<AppointmentsSubmodule>;
  job_management: ModuleCrudFlags;
  reports_analytics: ModuleCrudFlags;
  configuration: ModuleCrudFlags;
  master_management: ModuleWithSubmodules<MasterManagementSubmodule>;
  transactions: ModuleWithSubmodules<TransactionsSubmodule>;
  user_management: ModuleWithSubmodules<UserManagementSubmodule>;
};
```

Submodules allow granular control:
- `appointments` → `list_view`, `calendar_view`
- `master_management` → `vehicle`, `center`, `line`, `admin_pc`, `camera_anpr`, `charges`
- `transactions` → `payments`, `vehicle_records`, `customers`, `file_processing`, `rop_management`
- `user_management` → `users`, `roles`, `permissions`

### Guards (Applied Globally in AppModule)

| Guard | Order | Purpose |
|-------|-------|---------|
| `AuthGuard` | 1st | Validates JWT, builds `req.user` with `resolvedPermissions` |
| `PermissionsGuard` | 2nd | Checks `@Permissions()` decorator against `req.user.resolvedPermissions` |

### Decorators

```typescript
@Public()                              // Skip auth entirely
@Permissions(PermissionKeys.USER_VIEW) // Require specific permission
@CurrentUser() user: UserContext       // Inject authenticated user
```

### Permission Keys (`common/constants/permissions.ts`)

All permission keys are defined in `PermissionKeys` constant:
```typescript
PermissionKeys.USER_VIEW, USER_CREATE, USER_EDIT, USER_DELETE
PermissionKeys.ROLES_VIEW, ROLES_UPSERT, ROLES_DELETE
PermissionKeys.PERMISSIONS_VIEW, PERMISSIONS_UPSERT, PERMISSIONS_DELETE
PermissionKeys.MASTERS_VIEW, MASTERS_UPSERT, MASTERS_DELETE
PermissionKeys.ANPR_VIEW, ANPR_UPSERT, ANPR_DELETE
// ... etc
```

### Adding Auth to a New Endpoint

```typescript
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionKeys } from '../../common/constants/permissions';

@Get()
@Permissions(PermissionKeys.FEATURE_VIEW)  // Required permission
async findAll() { ... }

@Post()
@Permissions(PermissionKeys.FEATURE_CREATE)
async create(@Body() dto: CreateDto) { ... }
```

## Skills

### `/nestjs-module [feature-name]`
Scaffold a complete NestJS feature module following the DAO pattern. Creates:
- Entity with integer PK
- DAO interface + implementation
- Service with business logic
- Controller with CRUD endpoints
- Module wiring

### `/api-endpoint [description]`
Add an API endpoint to an existing module. Creates the controller method, service method, and DAO query following the layer conventions.

### `/db-migration [MigrationName]`
Generate and run TypeORM database migrations. Shows current migration state, generates migration from entity changes, runs pending migrations.

### `/dto-validation [feature-name]`
Create or update a DTO with class-validator decorators. Handles Create/Update/Query DTOs with proper validation rules.

### `/auth-guard [route-description]`
Add JWT authentication or role-based access control to routes. Configures guards, decorators, and permission checks.

## Folder Architecture

```
src/
├── app.module.ts                    # Root module — imports all feature modules
├── common/
│   ├── dto/                         # ALL DTOs live here (Create*, Update*, *Query, *Response)
│   ├── enums/                       # Shared enums (status codes, types)
│   ├── interfaces/                  # Shared interfaces
│   ├── constants/                   # PermissionKeys, other constants
│   ├── decorators/                  # @CurrentUser, @Permissions, @Public
│   ├── filters/                     # HttpExceptionFilter (error envelope)
│   ├── interceptors/                # ResponseInterceptor (success envelope)
│   ├── guards/                      # Reusable guards (distinct from src/guards/)
│   ├── logger/                      # AppLogger + LoggerModule
│   ├── middlewares/                 # LoggerMiddleware
│   ├── pipes/                       # Custom validation pipes
│   ├── services/                    # MasterScopeService
│   ├── types/                       # RoleAccessMatrix, type definitions
│   ├── shared/
│   │   ├── pagination/              # PaginationModule, TypeOrmPaginationService
│   │   ├── anpr/                    # ANPR utilities (plate parsing, image processing)
│   │   └── filter/                  # Query filter helpers
│   └── validators/                  # Custom class-validator decorators
├── guards/                          # Global guards: AuthGuard, PermissionsGuard
├── migrations/                      # TypeORM migrations
└── modules/
    ├── database/
    │   ├── entity/                  # ALL entities: <Name>Entity with integer PK
    │   ├── dao/                     # ALL DAO implementations: <Name>Dao
    │   └── database.module.ts       # @Global() — registers entities + DAOs
    ├── auth/                        # JWT login, sessions, token refresh
    ├── users/                       # User management (uses snowflake ID)
    ├── roles/                       # Role CRUD
    ├── permissions/                 # Permission profile CRUD
    ├── masters/                     # Master data (aggregator module)
    │   ├── masters.module.ts        # Only imports/exports children
    │   ├── centres/                 # @Controller('masters/centres')
    │   ├── lines/                   # @Controller('masters/lines')
    │   ├── cameras/                 # @Controller('masters/cameras')
    │   ├── vehicles/                # Vehicle master
    │   ├── tests/                   # Test types master
    │   ├── charges/                 # Fee/charge master
    │   ├── payment-type/            # Payment type master
    │   └── admin-pcs/               # Admin PC master
    ├── transactions/                # Transactional data (aggregator)
    │   ├── anpr-captures/           # ANPR capture events
    │   ├── customers/               # Customer records
    │   ├── payments/                # Payment transactions
    │   └── rop-verifications/       # ROP verification results
    ├── appointments/                # Appointment scheduling
    ├── jobs/                        # Inspection jobs
    ├── anpr/                        # Hikvision ANPR integration (FTP + HTTP push)
    └── integrations/                # External API integrations (ROP)
```

## Layer Flow (CRITICAL)

```
Controller (thin HTTP layer)
    ↓
Service (business logic, inject DAO via interface token)
    ↓
I<Name>Dao (interface in modules/<feature>/dao/)
    ↑
<Name>Dao (implementation in modules/database/dao/)
    ↓
<Name>Entity (modules/database/entity/)
    ↓
PostgreSQL
```

**DAO split rule:**
- Interface → `modules/<feature>/dao/<name>.dao.interface.ts`
- Implementation → `modules/database/dao/<name>.dao.ts`
- NEVER mix these locations

## Non-Obvious Rules

**Import suffix:** No `.js` extension — use modern TypeScript imports
```typescript
import { Foo } from './foo';     // correct
import { Foo } from './foo.js';  // wrong
```

**Primary keys:** Most entities use Snowflake IDs (`@SnowflakePrimaryColumn()`). Some older entities use integer `@PrimaryGeneratedColumn()`.

**DTOs:** Always in `common/dto/` — never inside feature module folders

**DatabaseModule:** Is `@Global()` — feature modules inject DAOs directly, do NOT re-import DatabaseModule

**DI tokens:** Use string literal `'I<Name>Dao'` directly — no constant files unless asked

**Env vars:** Read from `process.env` directly — no ConfigService for `POSTGRES_*`, `PORT`, `API_PREFIX`, `CORS_ORIGINS`

**Logger:** Always `AppLogger` — never `console.log`
```typescript
constructor(private readonly logger: AppLogger) {}
this.logger.log('message', 'ContextName');
this.logger.error('error', stack, 'ContextName');
```

## API Response Envelope

```typescript
// Success — ResponseInterceptor wraps automatically
{ success: true, message: string, data: T }

// Error — HttpExceptionFilter wraps
{ success: false, message: string, statusCode: number }
```

Return raw data from controllers — interceptor handles wrapping.

## New Feature Checklist

1. `modules/database/entity/<name>.entity.ts` — snowflake or integer PK, timestamps
2. `modules/database/dao/<name>.dao.ts` — implements interface
3. Register in `database.module.ts` — entity in forFeature, DAO in providers + exports
4. `modules/<feature>/dao/<name>.dao.interface.ts` — contract
5. `modules/<feature>/services/<name>.service.ts` — inject DAO by interface token
6. `modules/<feature>/<name>.controller.ts` — thin, delegates to service
7. `modules/<feature>/<name>.module.ts` — wire providers
8. Add `@Permissions()` decorators to protected endpoints
9. Add new permission keys to `common/constants/permissions.ts` if needed

---

## Intake → Payment Flow (CORE PIPELINE)

Vehicle inspection records flow through this fixed pipeline. A **Payment is only created at the point a Job is created** — never standalone.

```
ANPR capture (Hikvision plate read)   → AnprCapture
   ↓ resolve / create vehicle
VehicleRecord
   ↓ queued in the appointments list
Appointment
   ↓ processed together with the customer
Customer (created / linked)
   ↓ moves to inspection job
Job (created)
   ↓ at job creation, payment is processed
Payment (row written to payments table, linked via job_id)
```

Rules that follow from this:
- A payment always belongs to the context of a job. The manual **"New Payment (Manual Entry)"** drawer therefore makes **Job ID required** (a job must already exist).
- `payments.payment_type_id` is a **FK to the `payment_types` master** (the payment *mode*: Cash / UPI / Card) — NOT an enum. Frontend sends the selected master id; backend stores it.
- **Paid vs FOC is derived, not stored**: FOC ⇔ `grand_total = 0`. Service uses `grand_total > 0` to mean "paid" (sets `pay_date`, may auto-create a job). The mapper shows `FOC` when `status = Paid && grand_total = 0`.
- The payments entity does NOT store `payment_mode`, `charges`, or `vat` — those were intentionally removed. Mode is the `payment_type_id` master FK; charges/vat are not persisted on the payment.

## Migrations — keep DB in sync with entities (MANDATORY)

**Whenever you change an entity (or a related schema-affecting file — new/removed/renamed `@Column`, `@Index`, `@ManyToOne`/FK, table, nullability, type), you MUST reflect it in the migrations in the SAME change.**

- Fold changes into the single consolidated migration **`src/migrations/1782010000000-AlterSchema.ts`** — do **not** create new migration files.
- Make every statement **idempotent**: `ADD COLUMN IF NOT EXISTS`, `DROP COLUMN IF EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, guarded FK adds. The migration is re-run with `npm run migration:alter`.
- After editing, run `npm run migration:alter` to apply, and keep the `down()` section consistent.
- Adding a column that must be non-null on existing rows: add it nullable (or with a default) + backfill, don't blindly `SET NOT NULL` on a table with existing rows.
- A pure TypeScript-only change (filling an interface, adding a class `implements`, DTO validation, getters that don't map to columns) needs **no** migration — only actual DB schema changes do.

### Schema version bump (REQUIRED whenever AlterSchema.ts changes)

`SchemaBootstrapService` (`modules/database/service/schema-bootstrap.service.ts`) does **not** blindly re-run `AlterSchema.ts`'s ~400 statements on every app boot — that alone was costing ~70s of network round-trips on every restart. Instead it compares the file's `ALTER_SCHEMA_VERSION` constant against the version stamped in `onboarding_status.schema_version` at boot, and skips the whole migration when they already match.

**Whenever you edit `1782010000000-AlterSchema.ts`, bump `export const ALTER_SCHEMA_VERSION` at the top of that file in the SAME change.** Do this every time, in addition to (not instead of) the idempotency rules above:

- Forgetting to bump it is not silently dangerous — every statement is idempotent, so the app just keeps re-running the full migration on every boot until someone bumps it, which is slow but correct.
- Bump it even for a single-column tweak — there's no partial-version tracking, one number covers the whole file.
- After bumping, run `npm run migration:alter` once locally so your own DB gets stamped immediately, instead of waiting for the next natural boot to pick it up.
- Never reuse an old version number — always increment.

## Live Rules

**When I say "update the rules" or "add this to rules" in conversation, immediately update this CLAUDE.md file with the new rule.**

<!-- Add new rules discovered during development below this line -->
- Entity/schema changes must always be mirrored in `1782010000000-AlterSchema.ts` (idempotent) — see **Migrations** section above.
