import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

import type { PaginationMeta } from '../interfaces/pagination.interface';

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  statusCode: number;
  timestamp: string;
  method: string;
  path: string;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((body: unknown) => {
        const message =
          body &&
          typeof body === 'object' &&
          'message' in body &&
          typeof body.message === 'string'
            ? (body as { message: string }).message
            : 'Success';

        let data: unknown = null;
        let meta: PaginationMeta | undefined;
        if (body && typeof body === 'object') {
          if ('meta' in body && body.meta && typeof body.meta === 'object') {
            meta = body.meta as PaginationMeta;
          }
          if ('data' in body) {
            data = body.data;
          } else if ('result' in body) {
            data = body.result;
          } else {
            const {
              message: _m,
              result: _r,
              meta: _meta,
              ...rest
            } = body as Record<string, unknown>;
            data = Object.keys(rest).length > 0 ? rest : body;
          }
        } else if (body !== undefined) {
          data = body;
        }

        return {
          success: true as const,
          statusCode: response.statusCode,
          timestamp: new Date().toISOString(),
          method: request.method,
          path: request.url,
          message,
          data: data ?? null,
          ...(meta ? { meta } : {}),
        };
      }),
    );
  }
}
