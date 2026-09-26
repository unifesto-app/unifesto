import { Test, TestingModule } from '@nestjs/testing';
import { ConfigValidationService } from './config-validation.service';

describe('ConfigValidationService', () => {
  let service: ConfigValidationService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  const setupValidEnvironment = () => {
    process.env.AWS_REGION = 'ap-south-1';
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.COGNITO_USER_POOL_ID = 'ap-south-1_testpool';
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_TLS = 'true';
    process.env.DATABASE_URL =
      'postgresql://user:pass@localhost:5432/db?sslmode=require';
  };

  describe('onModuleInit', () => {
    it('should successfully validate when all required environment variables are present', async () => {
      setupValidEnvironment();

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      // Should not throw
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('should throw error when AWS_REGION is missing', async () => {
      setupValidEnvironment();
      delete process.env.AWS_REGION;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: AWS_REGION',
      );
    });

    it('should throw error when S3_BUCKET_NAME is missing', async () => {
      setupValidEnvironment();
      delete process.env.S3_BUCKET_NAME;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: S3_BUCKET_NAME',
      );
    });

    it('should throw error when COGNITO_USER_POOL_ID is missing', async () => {
      setupValidEnvironment();
      delete process.env.COGNITO_USER_POOL_ID;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: COGNITO_USER_POOL_ID',
      );
    });

    it('should throw error when COGNITO_CLIENT_ID is missing', async () => {
      setupValidEnvironment();
      delete process.env.COGNITO_CLIENT_ID;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: COGNITO_CLIENT_ID',
      );
    });

    it('should throw error when REDIS_HOST is missing', async () => {
      setupValidEnvironment();
      delete process.env.REDIS_HOST;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: REDIS_HOST',
      );
    });

    it('should throw error when REDIS_PORT is missing', async () => {
      setupValidEnvironment();
      delete process.env.REDIS_PORT;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: REDIS_PORT',
      );
    });

    it('should throw error when REDIS_TLS is missing', async () => {
      setupValidEnvironment();
      delete process.env.REDIS_TLS;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: REDIS_TLS',
      );
    });

    it('should throw error when DATABASE_URL is missing', async () => {
      setupValidEnvironment();
      delete process.env.DATABASE_URL;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: DATABASE_URL',
      );
    });

    it('should throw error when multiple environment variables are missing', async () => {
      setupValidEnvironment();
      delete process.env.AWS_REGION;
      delete process.env.S3_BUCKET_NAME;
      delete process.env.REDIS_HOST;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'Missing required environment variables: AWS_REGION, S3_BUCKET_NAME, REDIS_HOST',
      );
    });

    it('should throw error when DATABASE_URL does not include sslmode=require', async () => {
      setupValidEnvironment();
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/db'; // Missing sslmode=require

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'DATABASE_URL must include sslmode=require parameter for secure RDS connection',
      );
    });

    it('should throw error when DATABASE_URL has sslmode but not require', async () => {
      setupValidEnvironment();
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/db?sslmode=prefer';

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      await expect(service.onModuleInit()).rejects.toThrow(
        'DATABASE_URL must include sslmode=require parameter for secure RDS connection',
      );
    });

    it('should accept DATABASE_URL with sslmode=require among other parameters', async () => {
      setupValidEnvironment();
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/db?schema=public&sslmode=require&connect_timeout=10';

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigValidationService],
      }).compile();

      service = module.get<ConfigValidationService>(ConfigValidationService);

      // Should not throw
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});
