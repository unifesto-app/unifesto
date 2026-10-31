import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { reportError } from '../observability';

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
    // J1: a malformed id in a path (e.g. /careers/abc) reaches Prisma as an
    // invalid UUID (P2023). That is the caller's mistake, not a 500 that feeds
    // the API-down alarm.
    const badId =
      exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2023';
    const status = isHttpException
      ? exception.getStatus()
      : badId
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttpException
      ? exception.getResponse()
      : badId
        ? 'Invalid id'
        : 'Internal server error';

    const error = exception instanceof Error ? exception : undefined;
    const logContext = `${request.method} ${request.url}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Unexpected error — log the full stack trace for debugging.
      this.logger.error(
        `${logContext} -> ${status}`,
        error?.stack ?? String(exception),
      );
      // Path only: query strings can carry tokens.
      reportError(exception, {
        method: request.method,
        path: request.path,
        status: String(status),
        requestId:
          String((request as { id?: unknown }).id ?? '') ||
          (request.headers['cf-ray'] as string | undefined),
      });
    } else {
      // Expected client error (4xx) — log a single warning line.
      this.logger.warn(
        `${logContext} -> ${status}: ${JSON.stringify(message)}`,
      );
    }

    // Picked up by the request logger, so api_logs keeps why it failed (the
    // container logs rotate away with each deploy). Server-side only.
    response.locals.errorMessage =
      error?.message ?? (typeof message === 'string' ? message : JSON.stringify(message));

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
