# AGENTS.md — Antigravity Backend Project

> Cross-tool rules compatible with Google Antigravity, Cursor, and Claude Code

---

## Project Overview

**Antigravity Backend** - Production NestJS application with clean architecture

**Tech Stack:**
- NestJS framework
- TypeScript (strict mode)
- PostgreSQL database
- TypeORM for data access
- REST APIs
- Sequential integer primary keys

---

## Project Structure

```
src/
├── main.ts                          # Bootstrap, global pipes/filters/interceptors
├── app.module.ts
├── migrations/                      # TypeORM SQL migrations
├── common/
│   ├── dto/                         # Shared DTOs
│   ├── filters/                     # Exception filters
│   ├── interceptors/                # Response interceptors
│   ├── logger/                      # AppLogger service
│   └── shared/
│       └── pagination/              # Pagination utilities
└── modules/
    ├── database/                    # Infrastructure layer
    │   ├── entity/                  # TypeORM entities
    │   └── dao/                     # DAO implementations
    └── <feature>/                   # Feature modules
        ├── dao/*.interface.ts       # DAO contracts
        ├── service/                 # Business logic
        ├── *.controller.ts          # HTTP handlers
        └── *.module.ts
```

---

## Core Architecture Rules

### Layer Separation
- **Controllers**: HTTP layer only - validate input, call services, return responses
- **Services**: Business logic - orchestrate DAOs, apply domain rules
- **DAOs**: Data access - all database queries and operations
- **Entities**: Schema definition - TypeORM table mappings

### DAO Pattern
- DAO **interfaces** live in `modules/<feature>/dao/*.interface.ts`
- DAO **implementations** live in `modules/database/dao/*.dao.ts`
- `DatabaseModule` is `@Global()` - exports DAO implementations
- Feature modules inject DAOs and use them in services

### Flow Example
```
Request → Controller → Service → DAO (via interface) → Entity → Database
```

---

## Code Quality Standards

### TypeScript
- Strict mode enabled
- Explicit return types on all public methods
- Use `interface` for contracts, `type` for unions
- Prefer `unknown` over `any`
- Use utility types: `Partial`, `Pick`, `Omit`

### Functions & Files
- Keep functions under 50 lines
- Keep files under 300 lines
- Single Responsibility Principle
- Early returns for error conditions

### Naming Conventions
- Entities: `User`, `Camera`, `AnprEvent`
- DAOs: `UsersDao`, `CameraDao` (implements `IUserDao`, `ICameraDao`)
- Services: `UsersService`, `CameraService`
- Controllers: `UsersController`, `CameraController`

---

## Database Rules

### Entity Design
- Sequential integer `@PrimaryGeneratedColumn()` - **no UUIDs**
- Use `@Column()` with explicit types
- Apply `@Index()` for frequently queried fields
- Use `@CreateDateColumn()` and `@UpdateDateColumn()`
- Define relationships with `@ManyToOne`, `@OneToMany`
- Composite unique constraints via `@Index()` decorator

### Queries
- Use TypeORM query builders for complex queries
- Keep all DB logic in DAO layer
- Use transactions for multi-step operations
- Avoid N+1 queries - use eager/lazy loading
- Never use raw SQL unless absolutely necessary

### Migrations
- One migration per schema change
- Atomic and reversible
- Include indexes in migrations
- Test forward and rollback

---

## API Standards

### Response Format

**Success:**
```typescript
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error:**
```typescript
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

### Validation
- Use class-validator decorators in DTOs
- Global ValidationPipe with transform enabled
- Validate nested objects
- Whitelist unknown properties
- Return detailed validation errors

---

## Security Requirements

### Input Validation
- Validate all user inputs with class-validator
- Never trust client data
- Sanitize before processing

### Authentication & Authorization
- JWT-based authentication via Guards
- Role-based access control (RBAC)
- Never log passwords or sensitive credentials
- Environment variables via ConfigModule only

### Data Protection
- No hardcoded credentials
- Encrypt sensitive data at rest
- Use HTTPS for all API calls
- Rate limiting on public endpoints

---

## Error Handling

- Use NestJS exception filters
- Throw `HttpException` or custom exceptions
- Never expose internal errors to clients
- Log errors with context (userId, entityId, requestId)
- Handle database errors gracefully
- Centralized error handling logic

---

## Performance Guidelines

- Cache frequently accessed data
- Paginate large result sets
- Use async/await for I/O operations
- Batch database operations when possible
- Index frequently queried columns
- Lazy load heavy relationships
- PostgreSQL connection pooling

---

## Logging Standards

- Use AppLogger service (structured logging)
- Log with context strings: `UsersService`, `DatabaseModule`, `API`
- Never log passwords or sensitive data
- Include stack traces for errors
- API request/response logging via middleware

---

## Testing Requirements

- Unit tests for services and DAOs
- Mock external dependencies
- Integration tests for critical flows
- Focus on business logic coverage
- Keep tests deterministic

---

## Git Conventions

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
- Keep commits focused and atomic
- Write descriptive commit messages
- PR reviews required for rule changes

---

## Development Workflow

### Before Coding
1. Inspect existing modules and patterns
2. Reuse established conventions
3. Ask clarifying questions if requirements unclear

### Code Generation
1. Update existing files when possible
2. Follow the structure above strictly
3. Don't move files between modules
4. Register new entities/DAOs in `DatabaseModule`

### New Feature Template
```
modules/database/entity/<name>.entity.ts
modules/database/dao/<name>.dao.ts (implements I<Name>Dao)
modules/<feature>/dao/<name>.dao.interface.ts
modules/<feature>/service/<name>.service.ts
modules/<feature>/<name>.controller.ts
modules/<feature>/<name>.module.ts
```

---

## Response Style

- Be concise and implementation-focused
- Skip basic NestJS/TypeScript explanations
- Minimal comments - self-documenting code
- Modify only requested sections
- No boilerplate unless explicitly requested
- State uncertainty clearly
- Ask focused questions instead of guessing

---

## Deployment Readiness

- No TODOs in production code
- All environment variables documented
- Health check endpoint implemented
- Graceful shutdown handling (SIGTERM/SIGINT)
- Database connection pooling configured
- Error monitoring enabled

---

**Summary:** Build production-ready, type-safe NestJS applications following clean architecture. Database module owns entities + DAO implementations. Feature modules own DAO interfaces + services + controllers. Keep code maintainable, secure, and performant.