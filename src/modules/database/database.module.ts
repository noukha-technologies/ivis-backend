import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig, { DatabaseConfig } from './database.config.js';
import { User } from './entity/user.entity.js';
import { Role } from './entity/role.entity.js';
import { UserSession } from './entity/user-session.entity.js';
import { UsersDao } from './dao/users.dao.js';
import { RolesDao } from './dao/roles.dao.js';
import { UserSessionsDao } from './dao/user-sessions.dao.js';

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
    TypeOrmModule.forFeature([User, Role, UserSession]),
  ],
  providers: [UsersDao, RolesDao, UserSessionsDao],
  exports: [TypeOrmModule, UsersDao, RolesDao, UserSessionsDao],
})
export class DatabaseModule {}
