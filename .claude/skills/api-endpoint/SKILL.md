---
description: Add an API endpoint to an existing IVIS NestJS module, including the controller method, service method, and DAO query. Use when adding a route, creating an endpoint, or building an API for an existing feature.
when_to_use: Triggered by "add an endpoint", "create a route", "build an API for", "add GET", "add POST", "add PUT", "add DELETE", "add PATCH"
---

Add the `$ARGUMENTS` endpoint following IVIS layer conventions.

## Controller (thin)

```typescript
@Get(':id')
async findOne(
  @Param('id', ParseIntPipe) id: number,
): Promise<ResponseDto> {
  return this.service.findOne(id);
}

@Post()
async create(@Body() dto: Create<Name>Dto): Promise<ResponseDto> {
  return this.service.create(dto);
}

@Patch(':id')
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: Update<Name>Dto,
): Promise<ResponseDto> {
  return this.service.update(id, dto);
}

@Delete(':id')
async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
  return this.service.remove(id);
}
```
- `ParseIntPipe` on all integer path params
- No business logic in controller — only call service
- Return raw data — `ResponseInterceptor` wraps it automatically

## Service method

```typescript
async findOne(id: number): Promise<<Name>Entity> {
  const record = await this.dao.findById(id);
  if (!record) throw new NotFoundException(`<Name> #${id} not found`);
  return record;
}
```
- Throw `NotFoundException` / `BadRequestException` / `ConflictException` from `@nestjs/common`
- Log errors with `AppLogger`: `this.logger.error(msg, stack, '<Name>Service')`
- Early return on error conditions

## DAO interface + implementation

Add the method signature to `modules/<feature>/dao/<name>.dao.interface.ts` and implement it in `modules/database/dao/<name>.dao.ts`:

```typescript
// complex query example
async findAllWithFilter(params: PaginationDto): Promise<[<Name>Entity[], number]> {
  const qb = this.repo.createQueryBuilder('<name>')
    .where('<name>.isActive = :active', { active: true });
  return qb.getManyAndCount();
}
```
- Use QueryBuilder for joins, filters, complex conditions
- Use `repo.findOne`, `repo.save`, `repo.delete` for simple ops
- No business logic in DAO

## Pagination (list endpoints)

Inject `TypeOrmPaginationService` from `PaginationModule`:
```typescript
return this.paginationService.paginate(<Name>Entity, params, queryBuilder);
```
