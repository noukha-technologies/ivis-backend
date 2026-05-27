import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig, { DatabaseConfig } from './database.config';
import { User } from './entity/user.entity';
import { Role } from './entity/role.entity';
import { UserSession } from './entity/user-session.entity';
import { Vehicle } from './entity/vehicle.entity';
import { Test } from './entity/test.entity';
import { UsersDao } from './dao/users.dao';
import { RolesDao } from './dao/roles.dao';
import { UserSessionsDao } from './dao/user-sessions.dao';
import { VehicleDao } from './dao/vehicle.dao';
import { TestDao } from './dao/test.dao';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(databaseConfig),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get<DatabaseConfig>('database')!;
        return {
          ...dbConfig,
          autoLoadEntities: true,
        };
      },
    }),
    TypeOrmModule.forFeature([User, Role, UserSession, Vehicle, Test]),
  ],
  providers: [UsersDao, RolesDao, UserSessionsDao, VehicleDao, TestDao],
  exports: [TypeOrmModule, UsersDao, RolesDao, UserSessionsDao, VehicleDao, TestDao],
})
export class DatabaseModule {}
