import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import swaggerConfig from './common/swagger/swagger.config';
import databaseConfig from './modules/database/database.config';
import { LoggerModule } from './common/logger/logger.module';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './modules/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, swaggerConfig],
      envFilePath: ['.env'],
    }),
    LoggerModule,
    DatabaseModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService, LoggerMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
