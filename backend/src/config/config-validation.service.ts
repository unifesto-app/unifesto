import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

@Injectable()
export class ConfigValidationService implements OnModuleInit {
  private readonly logger = new Logger(ConfigValidationService.name);

  async onModuleInit() {
    this.logger.log('Validating environment configuration...');

    const requiredVars = [
      'AWS_REGION',
      'S3_BUCKET_NAME',
      'COGNITO_USER_POOL_ID',
      'COGNITO_CLIENT_ID',
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_TLS',
      'DATABASE_URL',
      'DIRECT_URL',
      'JWT_SECRET',
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
    ];

    // Check for missing environment variables
    const missing = requiredVars.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      const errorMessage = `Missing required environment variables: ${missing.join(', ')}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    // Validate DATABASE_URL contains sslmode=require parameter
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl?.includes('sslmode=require')) {
      const errorMessage =
        'DATABASE_URL must include sslmode=require parameter for secure RDS connection';
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    if (process.env.PORT && !/^\d{1,5}$/.test(process.env.PORT)) {
      const errorMessage = `PORT must be a number, got "${process.env.PORT}"`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    // S31: HMAC secrets. Unset = a key derived from JWT_SECRET (see
    // common/secrets.ts), which works but ties them to JWT rotation.
    for (const key of ['EMAIL_TRACKING_SECRET', 'TRAFFIC_HASH_SECRET', 'APPLE_TOKEN_ENCRYPTION_KEY']) {
      if (!process.env[key]) {
        this.logger.warn(`${key} not set: using a key derived from JWT_SECRET`);
      }
    }

    this.logger.log('Environment configuration validated successfully');
    this.logger.log(`AWS Region: ${process.env.AWS_REGION}`);
    this.logger.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
    this.logger.log(`Redis Host: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
    this.logger.log(`Redis TLS: ${process.env.REDIS_TLS}`);
    this.logger.log(`Razorpay configured: ${!!process.env.RAZORPAY_KEY_ID}`);

    // LiveKit is optional — only UNIFESTO_LIVE sessions need it, and the service
    // degrades gracefully (ServiceUnavailable) when absent. Log presence so a
    // half-set config (e.g. key but no secret/url) is obvious at boot.
    const livekitConfigured = Boolean(
      process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET &&
        process.env.LIVEKIT_URL,
    );
    this.logger.log(`LiveKit (live sessions) configured: ${livekitConfigured}`);

    // OneSignal push is optional — the notifications platform degrades to
    // logging SKIPPED/FAILED and never throws when unset. Log presence so a
    // half-set config (app id but no REST key) is obvious at boot.
    const oneSignalConfigured = Boolean(
      process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY,
    );
    this.logger.log(`OneSignal (push notifications) configured: ${oneSignalConfigured}`);

    // O17: unset = Apple sign-ins store no refresh token and account deletion
    // can't revoke at Apple (App Store 5.1.1(v)). Required before 5.0.0 submit.
    const appleMissing = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'].filter(
      (key) => !process.env[key],
    );
    if (appleMissing.length) {
      this.logger.warn(`Sign in with Apple token revoke off, missing: ${appleMissing.join(', ')}`);
    }
  }
}
