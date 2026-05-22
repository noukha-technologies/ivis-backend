import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error: any = null;

    // ─── Handle known NestJS/Http exceptions ─────────────────────────────
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resContent = exception.getResponse();

      if (typeof resContent === 'string') {
        message = resContent;
      } else if (typeof resContent === 'object' && resContent !== null) {
        const body = resContent as Record<string, any>;
        // class-validator returns message as an array
        message = Array.isArray(body.message) ? 'Validation failed' : (body.message || exception.message);
        error = Array.isArray(body.message) ? body.message : (body.error || null);
      }
    }
    // ─── Handle TypeORM duplicate key errors ─────────────────────────────
    else if (exception instanceof QueryFailedError) {
      const driverError = (exception as any).driverError;

      if (driverError?.code === '23505') {
        // Unique constraint violation
        status = HttpStatus.CONFLICT;
        const detail: string = driverError.detail || '';
        message = detail ? `Duplicate entry: ${detail}` : 'A record with this value already exists';
        error = 'Conflict';
      } else {
        message = 'A database error occurred';
        error = 'Database Error';
        this.logger.error(`QueryFailedError: ${exception.message}`, (exception as Error).stack);
      }
    }
    // ─── Handle generic errors ───────────────────────────────────────────
    else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled Error: ${exception.message}`, exception.stack);
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      message,
      error: error || message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(
      `${request.method} ${request.url} — ${status} — ${message}`,
    );

    response.status(status).json(errorResponse);
  }
}
