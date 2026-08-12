// Must run before any other import reads process.env — the module-scope
// constants below (PORT, API_PREFIX, CORS_ORIGINS) are evaluated at load time.
import {
  currentEnv,
  loadEnv,
  resolvedEnvFiles,
} from './common/config/env.config';
loadEnv();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app.logger';
import { SchemaBootstrapService } from './modules/database/service/schema-bootstrap.service';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildValidationException } from './common/utils/validation-error.util.js';
import { getUploadRoot } from './common/utils/file-storage.util';
import {
  writableNonProductionBranches,
  appointmentBaseUrl,
} from './common/integrations/appointments/appointment.constants';

// Canonical timezone: store/serve timestamps in UTC regardless of host machine.
// The admin panel renders them in Oman time (Asia/Muscat). Override via .env if needed.
process.env.TZ = process.env.TZ || 'UTC';
process.env.PGTZ = process.env.PGTZ || 'UTC';

const NODE_ENV: string = currentEnv();
const isDevelopment: boolean = NODE_ENV === 'development';
const isProduction: boolean = NODE_ENV === 'production';
const port: number = Number(process.env.PORT);
const apiPrefix: string = process.env.API_PREFIX ?? '';
const corsOrigins: string[] =
  process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) || [];

async function bootstrap() {
  const bootstrapLogger = new AppLogger();

  try {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bufferLogs: true,
    });
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    const logger = app.get(AppLogger);
    app.useLogger(logger);

    // Serve uploaded ANPR/job images. Static assets bypass the global API prefix.
    app.useStaticAssets(getUploadRoot(), { prefix: '/uploads' });

    app.setGlobalPrefix(apiPrefix);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        skipMissingProperties: false,
        stopAtFirstError: false,
        errorHttpStatusCode: 422,
        exceptionFactory: (errors) => buildValidationException(errors),
      }),
    );

    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`Blocked origin: ${origin}`, 'CORS');
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
      maxAge: 3600,
    });

    // Schema bootstrap runs unconditionally, before the server accepts any
    // HTTP traffic — decoupled from login entirely. A failure here must
    // abort startup (fail-fast), not leave the app serving against schema
    // in an unknown state.
    await app.get(SchemaBootstrapService).run();

    const configService = app.get(ConfigService);

    if (isDevelopment || configService.get<boolean>('swagger.enabled')) {
      const swaggerTitle =
        configService.get<string>('swagger.title') || 'API Documentation';
      const swaggerDesc =
        configService.get<string>('swagger.description') ||
        'API Endpoints Documentation';
      const swaggerVersion =
        configService.get<string>('swagger.version') || '1.0.0';
      const swaggerPath =
        configService.get<string>('swagger.path') || 'api/docs';

      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle(swaggerTitle)
          .setDescription(swaggerDesc)
          .setVersion(swaggerVersion)
          .addBearerAuth(
            {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT Bearer Token - Include in Authorization header',
            },
            'jwt',
          )
          .addApiKey(
            {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
              description: 'API Key for service-to-service authentication',
            },
            'api-key',
          )
          .build(),
      );

      SwaggerModule.setup(swaggerPath, app, document, {
        swaggerOptions: {
          persistAuthorization: true,
          deepLinking: true,
          displayRequestDuration: true,
          tryItOutEnabled: true,
        },
        customCss: '.swagger-ui .topbar { display: none }',
      });

      logger.log(
        `Swagger: http://localhost:${port}/${swaggerPath}`,
        'Bootstrap',
      );
    } else if (isProduction) {
      logger.log('Swagger disabled in production', 'Bootstrap');
    }

    await app.listen(port);

    logger.log(`Server: http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
    logger.log(
      `Environment: ${NODE_ENV} (env files: ${resolvedEnvFiles().join(', ') || 'none — using process env only'})`,
      'Bootstrap',
    );
    logger.log(
      `Appointment API: ${appointmentBaseUrl()} (writable branches: ${isProduction ? 'all (production)' : writableNonProductionBranches().join(', ')})`,
      'Bootstrap',
    );

    process.on('SIGTERM', async () => {
      logger.log('SIGTERM received, shutting down', 'Bootstrap');
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.log('SIGINT received, shutting down', 'Bootstrap');
      await app.close();
      process.exit(0);
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error(error.message, error.stack, 'Bootstrap');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error(String(reason), undefined, 'Bootstrap');
      process.exit(1);
    });
  } catch (error) {
    bootstrapLogger.error(
      'Failed to bootstrap application',
      String(error),
      'Bootstrap',
    );
    process.exit(1);
  }
}

bootstrap();
