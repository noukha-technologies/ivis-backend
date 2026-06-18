---
description: Scaffold a complete NestJS feature module for IVIS following the DAO pattern. Use when creating a new module, scaffolding a feature, or adding a new entity to the system.
when_to_use: Triggered by "create a module", "scaffold [feature]", "add [entity]", "new module", "add a feature"
argument-hint: [feature-name]
---

Scaffold the `$ARGUMENTS` feature module following IVIS architecture.

## Files to create

### 1. Entity — `modules/database/entity/<name>.entity.ts`
```typescript
@Entity('<table_name>')
export class <Name>Entity {
  @PrimaryGeneratedColumn()
  id: number;

  // columns here

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```
- Integer PK only — no UUID
- No business logic in entity

### 2. DAO interface — `modules/<feature>/dao/<name>.dao.interface.ts`
```typescript
export interface I<Name>Dao {
  findAll(params: PaginationDto): Promise<[<Name>Entity[], number]>;
  findById(id: number): Promise<<Name>Entity | null>;
  create(data: Create<Name>Dto): Promise<<Name>Entity>;
  update(id: number, data: Partial<Create<Name>Dto>): Promise<<Name>Entity>;
  delete(id: number): Promise<void>;
}
```

### 3. DAO implementation — `modules/database/dao/<name>.dao.ts`
```typescript
@Injectable()
export class <Name>Dao implements I<Name>Dao {
  constructor(
    @InjectRepository(<Name>Entity)
    private readonly repo: Repository<<Name>Entity>,
  ) {}
  // implement interface methods
}
```

### 4. Service — `modules/<feature>/service/<name>.service.ts`
```typescript
@Injectable()
export class <Name>Service {
  constructor(
    @Inject('I<Name>Dao') private readonly dao: I<Name>Dao,
    private readonly logger: AppLogger,
  ) {}
}
```

### 5. Controller — `modules/<feature>/<name>.controller.ts`
```typescript
@Controller('<names>')
export class <Name>Controller {
  constructor(private readonly service: <Name>Service) {}
}
```
Thin — delegates everything to service.

### 6. Module — `modules/<feature>/<name>.module.ts`
```typescript
@Module({
  imports: [PaginationModule], // only if lists needed
  controllers: [<Name>Controller],
  providers: [
    <Name>Service,
    { provide: 'I<Name>Dao', useClass: <Name>Dao }, // imported from DatabaseModule (global)
  ],
})
export class <Name>Module {}
```
Do NOT import `DatabaseModule` — it is `@Global()`.

## Register in DatabaseModule
In `modules/database/database.module.ts`:
- Add `<Name>Entity` to `TypeOrmModule.forFeature([...])`
- Add `{ provide: '<Name>Dao', useClass: <Name>Dao }` to providers and exports

## Import suffix
All imports use `.js`: `import { Foo } from './foo.js'`
