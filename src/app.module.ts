import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import swaggerConfig from './common/swagger/swagger.config';
import databaseConfig from './modules/database/database.config';
import { LoggerModule } from './common/logger/logger.module';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { UsersModule } from './modules/users/users.module';
import { MastersModule } from './modules/masters/masters.module';
import { DatabaseModule } from './modules/database/database.module';
import { PaginationModule } from './common/shared/pagination/pagination.module';
import { AuthModule } from './modules/auth/auth.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuthGuard } from './guards/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, swaggerConfig],
      envFilePath: ['.env'],
    }),
    LoggerModule,
    PaginationModule,
    DatabaseModule,
    UsersModule,
    MastersModule,
    TransactionsModule,
    JobsModule,
    AppointmentsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    LoggerMiddleware,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
