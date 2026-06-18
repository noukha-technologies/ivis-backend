# IVIS Backend Rules

NestJS 11, TypeScript strict, PostgreSQL, TypeORM. IVIS = Vehicle Inspection Management System with Hikvision ANPR camera integration.

## Architecture — Non-Obvious Rules

**DAO split (CRITICAL — do not mix these up):**
- DAO interface → `modules/<feature>/dao/<name>.dao.interface.ts`
- DAO implementation → `modules/database/dao/<name>.dao.ts`
- Entity → `modules/database/entity/<name>.entity.ts`
- `DatabaseModule` is `@Global()` — registers all entities + DAO providers; feature modules inject them directly, do NOT re-import `DatabaseModule`

**Import suffix:** Always `.js` (`import { Foo } from './foo.js'`) — TypeScript `nodenext` resolution

**Primary keys:** Sequential integer `@PrimaryGeneratedColumn()` ONLY — no UUIDs. The `users` module has a legacy UUID `id`; do NOT copy this pattern.

**DTOs:** Live in `common/dto/` — NOT inside feature module folders

**Masters pattern:** `modules/masters/` is an aggregator-only module. Each master lives at `modules/masters/<name>/` with `@Controller('masters/<name>')`. `MastersModule` only imports/exports its children.

**Env vars:** Read from `process.env` directly — `POSTGRES_*`, `PORT`, `API_PREFIX`, `CORS_ORIGINS`. No `app.config.ts` file. No `ConfigModule` injection for these.

**No DI token constants** unless explicitly asked — use string literal tokens directly.

## API Response Envelope

```typescript
// Success — wrapped by ResponseInterceptor automatically
{ success: true, message: string, data: T }

// Error — wrapped by HttpExceptionFilter
{ success: false, message: string, statusCode: number }
```

Return raw data from controllers — the interceptor wraps it.

## Logger

Use `AppLogger` from `common/logger/app.logger.ts` — inject it in services/controllers. Never `console.log`.

```typescript
constructor(private readonly logger: AppLogger) {}
// Usage:
this.logger.log('message', 'ContextName');
this.logger.error('error', stack, 'ContextName');
```

## Layer Flow

```
Controller → Service → I<Name>Dao (interface in feature)
                            ↑
                   <Name>Dao (impl in database module)
                            ↑
                    <Name>Entity → PostgreSQL
```

## New Feature Checklist

1. `modules/database/entity/<name>.entity.ts` — integer PK, no business logic
2. `modules/database/dao/<name>.dao.ts` — implements `I<Name>Dao`
3. Register entity + DAO in `modules/database/database.module.ts`
4. `modules/<feature>/dao/<name>.dao.interface.ts` — contract only
5. `modules/<feature>/service/<name>.service.ts` — business logic
6. `modules/<feature>/<name>.controller.ts` — thin HTTP layer
7. `modules/<feature>/<name>.module.ts` — wire providers, import `PaginationModule` if needed

## Skills

- `/nestjs-module` — scaffold full module following DAO pattern
- `/api-endpoint` — add controller endpoint + service + DAO method
- `/db-migration` — generate/run TypeORM migration
- `/dto-validation` — create DTO with class-validator
- `/auth-guard` — add JWT guard / RBAC to routes
