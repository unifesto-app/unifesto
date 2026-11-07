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
    // J14: the local docker-compose.dev.yml Postgres has no TLS, so outside
    // production an explicit sslmode=disable is allowed.
    const databaseUrl = process.env.DATABASE_URL;
    const localNoSsl =
      process.env.NODE_ENV !== 'production' && databaseUrl?.includes('sslmode=disable');
    if (!databaseUrl?.includes('sslmode=require') && !localNoSsl) {
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

    // OneSignal push is optional — the notifications platform degrades to
    // logging SKIPPED/FAILED and never throws when unset. Log presence so a
    // half-set config (app id but no REST key) is obvious at boot.
    const oneSignalConfigured = Boolean(
      process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY,
    );
    this.logger.log(`OneSignal (push notifications) configured: ${oneSignalConfigured}`);

    // C12 native push: optional until the app build that reports tokens ships.
    // Checked for shape only (a live call at boot would slow every deploy); a
    // bad key shows up as the push-health Sentry alert on the first sends.
    const apnsSet = ['APNS_KEY_P8', 'APNS_KEY_ID'].filter((key) => process.env[key]);
    if (apnsSet.length === 1) this.logger.warn('APNs half set: needs both APNS_KEY_P8 and APNS_KEY_ID');
    if (apnsSet.length === 2 && !(process.env.APNS_TEAM_ID || process.env.APPLE_TEAM_ID)) {
      this.logger.warn('APNs needs APNS_TEAM_ID (or APPLE_TEAM_ID)');
    }
    if (process.env.APNS_KEY_P8 && !process.env.APNS_KEY_P8.includes('PRIVATE KEY')) {
      this.logger.warn('APNS_KEY_P8 is not a .p8 key (no PRIVATE KEY header)');
    }
    let fcmReady = false;
    if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
      try {
        const sa = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
        fcmReady = !!(sa.project_id && sa.client_email && sa.private_key);
      } catch {
        // reported below
      }
      if (!fcmReady) this.logger.warn('FCM_SERVICE_ACCOUNT_JSON is not a service account key (project_id, client_email, private_key)');
    }
    this.logger.log(`Native push configured: APNs ${apnsSet.length === 2}, FCM ${fcmReady}`);

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
