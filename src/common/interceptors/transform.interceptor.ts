import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const httpResponse = ctx.getResponse();
    const statusCode = httpResponse.statusCode || HttpStatus.OK;

    return next.handle().pipe(
      map((body) => {
        // If the controller already returned { message, data }, use those values
        const message =
          body && typeof body === 'object' && 'message' in body
            ? body.message
            : 'Request completed successfully';

        const data =
          body && typeof body === 'object' && 'data' in body
            ? body.data
            : body;

        // Spread any extra keys (e.g. pagination meta) into the top-level response
        const extra: Record<string, any> = {};
        if (body && typeof body === 'object') {
          for (const key of Object.keys(body)) {
            if (key !== 'message' && key !== 'data') {
              extra[key] = body[key];
            }
          }
        }

        return {
          success: true,
          statusCode,
          message,
          data: data !== undefined ? data : null,
          ...extra,
        };
      }),
    );
  }
}
