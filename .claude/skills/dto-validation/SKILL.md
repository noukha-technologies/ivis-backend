---
description: Create or update a DTO with class-validator decorators for IVIS NestJS. Use when adding validation, creating a DTO, or validating request body/query params.
when_to_use: Triggered by "add validation", "create a DTO", "validate the request", "input validation", "request body"
argument-hint: [feature-name]
---

Create/update the DTO for `$ARGUMENTS` in `src/common/dto/`.

## Create DTO

```typescript
import {
  IsString, IsInt, IsOptional, IsNotEmpty, IsEmail,
  Min, Max, MaxLength, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class Create<Name>Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)       // required for numeric query params (arrive as strings)
  relatedId: number;

  @IsOptional()
  @IsString()
  description?: string;
}
```

## Update DTO

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { Create<Name>Dto } from './create-<name>.dto.js';

export class Update<Name>Dto extends PartialType(Create<Name>Dto) {}
```

## Common validators

```typescript
@IsEmail()                          // email format
@IsEnum(RoleEnum)                   // enum membership
@IsArray() @IsInt({ each: true })   // array of integers
@IsDateString()                     // ISO date string
@IsIP()                             // IP address
@IsPort()                           // port number (1-65535)
@ValidateNested() @Type(() => Sub)  // nested DTO
@IsIn(['active', 'inactive'])       // allowed values
@Matches(/^\d{4}-\d{2}-\d{2}$/)    // regex
```

## Rules

- `@Type(() => Number)` on any numeric field from query params — they arrive as strings
- `whitelist: true` and `transform: true` are global in `main.ts` — unknown properties stripped automatically
- Never use `any` in DTOs
- Nested objects: `@ValidateNested()` + `@Type(() => NestedDto)` both required
- Location: `src/common/dto/<name>.dto.ts` — always in `common/dto/`, not inside feature folders
- Name pattern: `Create<Name>Dto`, `Update<Name>Dto`, `<Name>QueryDto`, `<Name>ResponseDto`
