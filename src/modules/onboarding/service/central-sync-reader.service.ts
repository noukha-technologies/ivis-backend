import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, ObjectLiteral } from 'typeorm';

import { CENTRAL_DATA_SOURCE } from '../../database/central-data-source.token';
import { Centre } from '../../database/entity/centre.entity';
import { Line } from '../../database/entity/line.entity';
import { Camera } from '../../database/entity/camera.entity';
import { CameraLineMapping } from '../../database/entity/camera-line-mapping.entity';
import { AdminPc } from '../../database/entity/admin-pc.entity';
import { AdminPcLineMapping } from '../../database/entity/admin-pc-line-mapping.entity';
import { Configurations } from '../../database/entity/configuration.entity';
import { Charge } from '../../database/entity/charge.entity';
import { ChargeCategory } from '../../database/entity/charge-category.entity';
import { Role } from '../../database/entity/role.entity';
import { Permission } from '../../database/entity/permission.entity';
import { User } from '../../database/entity/user.entity';
import { UserLineMapping } from '../../database/entity/user-line-mapping.entity';

/**
 * Thin read-only reader over the 'central' (Master DB) connection — one
 * method per centre-scoped lookup Onboarding Sync needs, rather than a full
 * DAO per entity. This connection is read-only end to end (see
 * central-database.config.ts / CENTRAL_DB_* read-only role) and connects
 * lazily on first use (see central-data-source.token.ts / database.module.ts)
 * so a Master DB outage never crashes the app for already-onboarded centres —
 * it only ever surfaces as an error from these methods.
 */
@Injectable()
export class CentralSyncReaderService {
  constructor(
    @Inject(CENTRAL_DATA_SOURCE) private readonly centralDataSource: DataSource,
  ) {}

  private async ensureConnected(): Promise<DataSource> {
    if (!this.centralDataSource.isInitialized) {
      await this.centralDataSource.initialize();
    }
    return this.centralDataSource;
  }

  private async repo<T extends ObjectLiteral>(entity: {
    new (): T;
  }) {
    const dataSource = await this.ensureConnected();
    return dataSource.getRepository(entity);
  }

  async findUserByEmailWithPassword(email: string): Promise<User | null> {
    const repo = await this.repo(User);
    return repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .andWhere('user.is_deleted = false')
      .getOne();
  }

  async findCentreById(centreId: string): Promise<Centre | null> {
    const repo = await this.repo(Centre);
    return repo.findOne({ where: { id: centreId } });
  }

  async findLinesByCentreId(centreId: string): Promise<Line[]> {
    const repo = await this.repo(Line);
    return repo.find({ where: { centre_id: centreId } });
  }

  async findLinesByIds(ids: string[]): Promise<Line[]> {
    if (!ids.length) return [];
    const repo = await this.repo(Line);
    return repo.find({ where: { id: In(ids) } });
  }

  async findCameraLineMappingsByLineIds(
    lineIds: string[],
  ): Promise<CameraLineMapping[]> {
    if (!lineIds.length) return [];
    const repo = await this.repo(CameraLineMapping);
    return repo.find({ where: { line_id: In(lineIds) } });
  }

  async findCamerasByIds(cameraIds: string[]): Promise<Camera[]> {
    if (!cameraIds.length) return [];
    const repo = await this.repo(Camera);
    return repo.find({ where: { id: In(cameraIds) } });
  }

  async findAdminPcLineMappingsByLineIds(
    lineIds: string[],
  ): Promise<AdminPcLineMapping[]> {
    if (!lineIds.length) return [];
    const repo = await this.repo(AdminPcLineMapping);
    return repo.find({ where: { line_id: In(lineIds) } });
  }

  async findAdminPcsByIds(adminPcIds: string[]): Promise<AdminPc[]> {
    if (!adminPcIds.length) return [];
    const repo = await this.repo(AdminPc);
    return repo.find({ where: { id: In(adminPcIds) } });
  }

  async findConfigurationsByCentreId(
    centreId: string,
  ): Promise<Configurations[]> {
    const repo = await this.repo(Configurations);
    return repo.find({ where: { centre_id: centreId } });
  }

  async findChargesByCentreId(centreId: string): Promise<Charge[]> {
    const repo = await this.repo(Charge);
    return repo.find({ where: { centre_id: centreId } });
  }

  async findChargeCategoriesByIds(ids: string[]): Promise<ChargeCategory[]> {
    if (!ids.length) return [];
    const repo = await this.repo(ChargeCategory);
    return repo.find({ where: { id: In(ids) } });
  }

  async findRolesByCentreId(centreId: string): Promise<Role[]> {
    const repo = await this.repo(Role);
    return repo.find({ where: { center_id: centreId } });
  }

  async findRolesByIds(ids: string[]): Promise<Role[]> {
    if (!ids.length) return [];
    const repo = await this.repo(Role);
    return repo.find({ where: { id: In(ids) } });
  }

  async findPermissionsByIds(ids: string[]): Promise<Permission[]> {
    if (!ids.length) return [];
    const repo = await this.repo(Permission);
    return repo.find({ where: { id: In(ids) } });
  }

  async findUsersByCentreId(centreId: string): Promise<User[]> {
    // password is select:false on the entity — must be explicitly re-added,
    // otherwise the synced local User rows would have no password hash at all.
    const repo = await this.repo(User);
    return repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.center_id = :centreId', { centreId })
      .getMany();
  }

  async findUserLineMappingsByUserIds(
    userIds: string[],
  ): Promise<UserLineMapping[]> {
    if (!userIds.length) return [];
    const repo = await this.repo(UserLineMapping);
    return repo.find({ where: { user_id: In(userIds) } });
  }
}
