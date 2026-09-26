# Config Module

## Overview

The Config module provides environment variable validation to ensure all required AWS service configurations are present before the application starts.

## Components

### ConfigValidationService

A NestJS service that implements `OnModuleInit` to validate required environment variables at application startup.

**Location**: `src/config/config-validation.service.ts`

**Responsibilities**:
- Validates presence of all required AWS environment variables
- Ensures DATABASE_URL includes `sslmode=require` parameter
- Throws descriptive errors if configuration is invalid
- Logs successful validation with key configuration values

**Required Environment Variables**:
- `AWS_REGION` - AWS region for all AWS services (e.g., ap-south-1)
- `S3_BUCKET_NAME` - Name of S3 bucket for file storage
- `COGNITO_USER_POOL_ID` - AWS Cognito user pool ID for JWT verification
- `COGNITO_CLIENT_ID` - AWS Cognito client ID for JWT verification
- `REDIS_HOST` - ElastiCache (Valkey) hostname
- `REDIS_PORT` - ElastiCache port number
- `REDIS_TLS` - Boolean flag to enable TLS for Redis connection
- `DATABASE_URL` - PostgreSQL connection string (must include sslmode=require)

### ConfigModule

A NestJS module that exports the ConfigValidationService.

**Location**: `src/config/config.module.ts`

**Usage**:
```typescript
import { ConfigModule } from './config/config.module';

@Module({
  imports: [ConfigModule],
})
export class AppModule {}
```

## Behavior

### Startup Validation

When the application starts, the `ConfigValidationService.onModuleInit()` method is automatically called:

1. **Checks for missing variables**: Validates all required environment variables are present
2. **Validates DATABASE_URL**: Ensures the connection string includes `sslmode=require`
3. **Throws errors**: If validation fails, throws an `Error` with descriptive message listing missing variables
4. **Logs success**: If validation succeeds, logs configuration details (excluding sensitive values)

### Example Success Log

```
[Nest] 12345  - 01/01/2024, 12:00:00 PM     LOG [ConfigValidationService] Validating environment configuration...
[Nest] 12345  - 01/01/2024, 12:00:00 PM     LOG [ConfigValidationService] Environment configuration validated successfully
[Nest] 12345  - 01/01/2024, 12:00:00 PM     LOG [ConfigValidationService] AWS Region: ap-south-1
[Nest] 12345  - 01/01/2024, 12:00:00 PM     LOG [ConfigValidationService] S3 Bucket: unifesto-storage-bucket
[Nest] 12345  - 01/01/2024, 12:00:00 PM     LOG [ConfigValidationService] Redis Host: localhost:6379
[Nest] 12345  - 01/01/2024, 12:00:00 PM     LOG [ConfigValidationService] Redis TLS: true
```

### Example Failure Scenarios

**Missing Environment Variables**:
```
[Nest] 12345  - 01/01/2024, 12:00:00 PM   ERROR [ConfigValidationService] Missing required environment variables: AWS_REGION, S3_BUCKET_NAME
Error: Missing required environment variables: AWS_REGION, S3_BUCKET_NAME
```

**Invalid DATABASE_URL**:
```
[Nest] 12345  - 01/01/2024, 12:00:00 PM   ERROR [ConfigValidationService] DATABASE_URL must include sslmode=require parameter for secure RDS connection
Error: DATABASE_URL must include sslmode=require parameter for secure RDS connection
```

## Testing

Unit tests are provided in `config-validation.service.spec.ts` covering:

- ✅ Successful validation with all variables present
- ✅ Error when each individual variable is missing
- ✅ Error when multiple variables are missing
- ✅ Error when DATABASE_URL doesn't include sslmode=require
- ✅ Error when DATABASE_URL has wrong sslmode value
- ✅ Success when DATABASE_URL has sslmode=require with other parameters

Run tests:
```bash
npm test -- config-validation.service.spec.ts
```

## Integration with AppModule

The ConfigModule is imported in `AppModule` to ensure validation runs at application startup:

```typescript
@Module({
  imports: [
    // Load environment variables from .env file
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Config Validation (validates AWS environment variables)
    ConfigModule,
    // Other modules...
  ],
})
export class AppModule {}
```

**Important**: The ConfigModule should be imported **after** `NestConfigModule.forRoot()` to ensure environment variables are loaded before validation.

## Related Documentation

- [AWS Migration Design Document](/.kiro/specs/aws-migration/design.md)
- [AWS Migration Requirements](/.kiro/specs/aws-migration/requirements.md)
- [AWS Migration Tasks](/.kiro/specs/aws-migration/tasks.md)
