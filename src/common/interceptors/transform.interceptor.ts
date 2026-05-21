import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const httpResponse = ctx.getResponse();
    const statusCode = httpResponse.statusCode || HttpStatus.OK;

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode,
        message: 'Request completed successfully',
        data: data !== undefined ? data : null,
      })),
    );
  }
}
