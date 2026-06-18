---
description: Add JWT authentication guard or role-based access control to IVIS NestJS routes. Use when protecting a route, adding auth, implementing RBAC, or requiring JWT on an endpoint.
when_to_use: Triggered by "protect this route", "add auth", "role-based access", "require JWT", "add guard", "RBAC", "require permission"
---

Add authentication/authorization to `$ARGUMENTS` routes.

## JWT Guard (authentication only)

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard.js';

@UseGuards(JwtAuthGuard)
@Controller('resource')
export class ResourceController {}
```

Apply at controller level for all routes, or at method level for selective protection.

## Role-based access control

```typescript
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../guards/roles.guard.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  @Roles(Role.Admin, Role.SuperAdmin)
  @Get()
  findAll() { ... }
}
```

## Access current user in controller

```typescript
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

@Get('profile')
@UseGuards(JwtAuthGuard)
getProfile(@CurrentUser() user: JwtPayload) {
  return this.service.findById(user.userId);
}
```

## Check existing guards before creating new ones

Look in `src/guards/` for existing guard implementations. Common guards:
- `JwtAuthGuard` — validates Bearer token
- `RolesGuard` — checks `@Roles()` decorator against JWT payload

## Rules

- Guards live in `src/guards/`
- Role constants live in `common/` enums — never hardcode role strings
- Log auth failures with context: `this.logger.warn('Unauthorized', 'AuthGuard')`
- Never log JWT tokens or passwords
- `JwtAuthGuard` must come before `RolesGuard` in `@UseGuards()` order — authentication before authorization
- For public routes inside a guarded controller: use `@Public()` decorator (check if it exists in `common/decorators/`)
