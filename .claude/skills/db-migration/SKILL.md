---
description: Generate and run TypeORM database migrations for IVIS. Use when adding a column, creating a table, altering the schema, or running pending migrations.
when_to_use: Triggered by "add a column", "create a table", "alter the schema", "run migration", "generate migration", "schema change"
disable-model-invocation: true
argument-hint: [MigrationName]
---

## Current migration state
!`cd ivis-backend && pnpm migration:run -- --dryrun 2>&1 | tail -20 || echo "Run from ivis-backend/ directory"`

## Generate migration

Run from `ivis-backend/`:
```bash
pnpm migration:generate -- src/migrations/$ARGUMENTS
```
This compares current entities against the DB schema and generates SQL automatically.

## Run pending migrations

```bash
pnpm migration:run
```

## Workflow

1. **Update the entity** first — add/modify columns, indexes, relations
2. **Generate** the migration file
3. **Review** the generated SQL in `src/migrations/<timestamp>-$ARGUMENTS.ts`
   - Verify column types are correct
   - Check that indexes are included
   - Confirm `down()` reverses the `up()` correctly
4. **Run** `pnpm migration:run`
5. **Verify** with `pnpm start:dev` — no TypeORM schema-sync errors

## Migration rules

- One migration per logical schema change
- Naming: PascalCase describing the change — `AddPlateNumberToAnprEvent`, `CreateCameraTable`
- Always test rollback: the `down()` method must work
- Include indexes in the same migration as the column
- Never use `synchronize: true` in production — migrations only

## Common patterns

```typescript
// Add nullable column
await queryRunner.query(`ALTER TABLE "table" ADD COLUMN "col" VARCHAR NULL`);

// Add non-nullable with default
await queryRunner.query(`ALTER TABLE "table" ADD COLUMN "col" INT NOT NULL DEFAULT 0`);

// Add index
await queryRunner.query(`CREATE INDEX "IDX_table_col" ON "table" ("col")`);

// Add foreign key
await queryRunner.query(`ALTER TABLE "child" ADD CONSTRAINT "FK_child_parent" FOREIGN KEY ("parentId") REFERENCES "parent"("id") ON DELETE CASCADE`);
```
