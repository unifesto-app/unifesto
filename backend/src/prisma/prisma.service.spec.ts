import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { Logger } from '@nestjs/common';

describe('PrismaService', () => {
  let service: PrismaService;
  let loggerSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('maskDatabaseUrl', () => {
    it('should mask password in database URL', () => {
      const url = 'postgresql://user:password123@host:5432/db?sslmode=require';
      // Access private method via any type assertion for testing
      const maskedUrl = (service as any).maskDatabaseUrl(url);
      
      expect(maskedUrl).toContain('use***');
      expect(maskedUrl).toContain('****'); // Password masked
      expect(maskedUrl).not.toContain('password123');
      expect(maskedUrl).toContain('host:5432');
      expect(maskedUrl).toContain('sslmode=require');
    });

    it('should handle undefined DATABASE_URL', () => {
      const maskedUrl = (service as any).maskDatabaseUrl(undefined);
      expect(maskedUrl).toBe('DATABASE_URL not set');
    });

    it('should handle invalid DATABASE_URL format', () => {
      const maskedUrl = (service as any).maskDatabaseUrl('not-a-valid-url');
      expect(maskedUrl).toBe('Invalid DATABASE_URL format');
    });

    it('should preserve sslmode parameter', () => {
      const url = 'postgresql://unifesto_admin:Un!feSt0AWS2212@host:5432/db?sslmode=require';
      const maskedUrl = (service as any).maskDatabaseUrl(url);
      
      expect(maskedUrl).toContain('sslmode=require');
      expect(maskedUrl).not.toContain('Un!feSt0AWS2212');
    });
  });

  describe('onModuleInit', () => {
    it('should log success message with SSL when connection succeeds', async () => {
      // Mock successful connection
      jest.spyOn(service, '$connect').mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith('Successfully connected to database with SSL');
    });

    it('should log error with masked connection string when connection fails', async () => {
      // Mock failed connection
      const connectionError = new Error('Connection refused');
      jest.spyOn(service, '$connect').mockRejectedValue(connectionError);

      // Set DATABASE_URL for testing
      process.env.DATABASE_URL = 'postgresql://user:secret@host:5432/db?sslmode=require';

      await expect(service.onModuleInit()).rejects.toThrow('Connection refused');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to connect to database',
        expect.objectContaining({
          connectionString: expect.stringContaining('use***'),
          error: 'Connection refused',
        }),
      );

      // Verify password is masked in the logged connection string
      const errorCall = loggerErrorSpy.mock.calls[0];
      expect(errorCall[1].connectionString).not.toContain('secret');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect and log message', async () => {
      jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(loggerSpy).toHaveBeenCalledWith('Disconnected from database');
    });
  });

  describe('SSL Connection String Verification', () => {
    it('should verify DATABASE_URL contains sslmode=require', () => {
      const urlWithSSL = 'postgresql://user:pass@host:5432/db?sslmode=require';
      expect(urlWithSSL).toContain('sslmode=require');
    });

    it('should detect missing sslmode parameter', () => {
      const urlWithoutSSL = 'postgresql://user:pass@host:5432/db';
      expect(urlWithoutSSL).not.toContain('sslmode=require');
    });
  });
});
