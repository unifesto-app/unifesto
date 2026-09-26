import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Catches every unhandled exception, logs the full stack trace via the Nest
 * Logger (so crashes surface in PM2 / CloudWatch logs), and returns a clean
 * JSON error response without leaking internals on 5xx errors.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttpException
      ? exception.getResponse()
      : 'Internal server error';

    const error = exception instanceof Error ? exception : undefined;
    const logContext = `${request.method} ${request.url}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Unexpected error — log the full stack trace for debugging.
      this.logger.error(
        `${logContext} -> ${status}`,
        error?.stack ?? String(exception),
      );
    } else {
      // Expected client error (4xx) — log a single warning line.
      this.logger.warn(
        `${logContext} -> ${status}: ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === 'string'
          ? message
          : (message as Record<string, unknown>)?.['message'] ?? message,
    });
  }
}
