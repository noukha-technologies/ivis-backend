import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { AppService } from './app.service';
import { AppController } from './app.controller';

import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

import swaggerConfig from './common/swagger/swagger.config';
import { LoggerModule } from './common/logger/logger.module';
import { MasterScopeModule } from './common/services/master-scope.module';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { PaginationModule } from './common/shared/pagination/pagination.module';


import { JobsModule } from './modules/jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { AnprModule } from './modules/anpr/anpr.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import databaseConfig from './modules/database/database.config';
import { MastersModule } from './modules/masters/masters.module';
import { DatabaseModule } from './modules/database/database.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, swaggerConfig],
      envFilePath: ['.env'],
    }),
    ScheduleModule.forRoot(),
    LoggerModule,
    PaginationModule,
    DatabaseModule,
    MasterScopeModule,
    UsersModule,
    MastersModule,
    TransactionsModule,
    JobsModule,
    AppointmentsModule,
    IntegrationsModule,
    AnprModule,
    ConfigurationModule,
    AuthModule,
    PermissionsModule,
    RolesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    LoggerMiddleware,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
