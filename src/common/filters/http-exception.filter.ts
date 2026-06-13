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
import type { FieldValidationError } from '../utils/validation-error.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error: string | string[] | null = null;
    let errors: FieldValidationError[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resContent = exception.getResponse();

      if (typeof resContent === 'string') {
        message = resContent;
      } else if (typeof resContent === 'object' && resContent !== null) {
        const body = resContent as Record<string, unknown>;
        const bodyMessage = body.message;

        if (Array.isArray(body.errors)) {
          errors = body.errors as FieldValidationError[];
          message = 'Validation failed';
          error = errors.map((item) => item.message);
        } else if (Array.isArray(bodyMessage)) {
          message = 'Validation failed';
          error = bodyMessage as string[];
        } else {
          message = String(bodyMessage || exception.message);
          error = String(body.error || null);
        }
      }
    } else if (exception instanceof QueryFailedError) {
      const driverError = (exception as QueryFailedError & { driverError?: { code?: string; detail?: string } })
        .driverError;

      if (driverError?.code === '23505') {
        status = HttpStatus.CONFLICT;
        const detail = driverError.detail || '';
        message = detail ? `Duplicate entry: ${detail}` : 'A record with this value already exists';
        error = 'Conflict';
      } else {
        message = 'A database error occurred';
        error = 'Database Error';
        this.logger.error(`QueryFailedError: ${exception.message}`, (exception as Error).stack);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled Error: ${exception.message}`, exception.stack);
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      message,
      error: error || message,
      ...(errors ? { errors } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(`${request.method} ${request.url} — ${status} — ${message}`);

    response.status(status).json(errorResponse);
  }
}
