import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { AppService } from './app.service';
import { AppController } from './app.controller';

import { AuthGuard } from './guards/auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';

import swaggerConfig from './common/swagger/swagger.config';
import databaseConfig from './modules/database/database.config';

import { JobsModule } from './modules/jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { AnprModule } from './modules/anpr/anpr.module';
import { LoggerModule } from './common/logger/logger.module';
import { MastersModule } from './modules/masters/masters.module';
import { DatabaseModule } from './modules/database/database.module';
import { MasterScopeModule } from './common/services/master-scope.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PaginationModule } from './common/shared/pagination/pagination.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';

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
    AnprModule,
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
