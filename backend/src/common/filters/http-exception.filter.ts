import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const _request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let code: string;
    let message: string;

    if (typeof exceptionResponse === 'string') {
      code = 'HTTP_ERROR';
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object') {
      const resp = exceptionResponse as Record<string, unknown>;
      code = (resp['error'] as string) || 'HTTP_ERROR';
      message =
        Array.isArray(resp['message'])
          ? (resp['message'] as string[]).join('; ')
          : (resp['message'] as string) || exception.message;
    } else {
      code = 'HTTP_ERROR';
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
}
