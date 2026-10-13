import './instrument';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LogsService } from './logs/logs.service';
import { createRequestLogger } from './logs/logging.middleware';
import { isAllowedOrigin } from './common/cors';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import axios from 'axios';
import { OUTBOUND_TIMEOUT_MS } from './common/http/outbound-timeouts';
import { Logger as PinoLogger } from 'nestjs-pino';
import { jsonLogsEnabled } from './common/observability';

// S32: no outbound axios call (WhatsApp, OneSignal, Razorpay's SDK) may hang
// forever. Set before any service is constructed so SDK instances inherit it.
axios.defaults.timeout = OUTBOUND_TIMEOUT_MS;

// Node 22 exits on an unhandled rejection, so one forgotten `.catch` on a
// fire-and-forget notification took a whole replica down mid-request. Log it
// instead; every intentional `void promise` also carries its own `.catch`.
process.on('unhandledRejection', (reason) => {
  new Logger('UnhandledRejection').error(
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  );
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Preserve the raw request body so webhook signatures (e.g. WhatsApp/Meta,
    // LiveKit) can be verified against the exact bytes that were signed.
    rawBody: true,
    // With LOG_FORMAT=json, hold boot logs until the pino logger takes over.
    bufferLogs: jsonLogsEnabled(),
  });
  if (jsonLogsEnabled()) app.useLogger(app.get(PinoLogger));

  // LiveKit posts webhooks as `application/webhook+json`; teach the JSON parser
  // to accept that content type so the raw body is captured for signing checks.
  app.useBodyParser('json', {
    type: ['application/json', 'application/webhook+json'],
  });

  // Remove the X-Powered-By header (avoids advertising the Express stack)
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // The API runs behind Caddy (reverse_proxy -> backend:8080). Trust exactly
  // ONE proxy hop so Express reads the real client IP from X-Forwarded-For
  // instead of reporting Caddy's container address for every request. Without
  // this, all traffic collapses to a single IP and the rate limiter throttles
  // the entire user base as if it were one client. `1` (not `true`) means only
  // the first hop is trusted, so clients cannot spoof X-Forwarded-For.
  app.set('trust proxy', 1);

  // Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Enable CORS for all Unifesto subdomains
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Only allow *.unifesto.app subdomains, the apex domain, and localhost for dev.
      // Credentialed requests must never be allowed from an arbitrary reflected origin.
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Blocked CORS request from disallowed origin: ${origin}`);
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400, // 24 hours
  });

  // Record requests to the api_logs table (admin "Logs" section). Successful
  // GETs are sampled 1-in-N (API_LOG_GET_SAMPLE_RATE, default 10) with a weight.
  app.use(
    createRequestLogger(
      app.get(LogsService),
      Number(process.env.API_LOG_GET_SAMPLE_RATE) || 10,
    ),
  );

  // Catch-all exception filter: logs stack traces and returns clean JSON.
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Route Socket.IO broadcasts (leaderboard) through Redis pub/sub so
  // they reach clients on every backend replica. Falls back to the in-memory
  // adapter (single-replica-only realtime) if Redis is unavailable.
  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Fire OnModuleDestroy on SIGTERM/SIGINT so long-lived infra (the BullMQ
  // certificate worker, Redis clients) closes gracefully on container stop.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}
bootstrap();
