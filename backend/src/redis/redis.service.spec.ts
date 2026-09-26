import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;
  let mockRedisClient: jest.Mocked<Redis>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        REDIS_HOST: 'test-redis.cache.amazonaws.com',
        REDIS_PORT: 6379,
        REDIS_TLS: 'true',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a mock Redis client with all necessary methods and event handling
    mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn((event, handler) => {
        // Store event handlers for later triggering
        if (!mockRedisClient['_eventHandlers']) {
          mockRedisClient['_eventHandlers'] = {};
        }
        mockRedisClient['_eventHandlers'][event] = handler;
        return mockRedisClient;
      }),
      _eventHandlers: {},
    } as any;

    // Mock Redis constructor
    (Redis as unknown as jest.Mock).mockImplementation(() => mockRedisClient);

    // Spy on logger methods
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      expect(service).toBeDefined();
    });

    it('should initialize Redis client with correct configuration on module init', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      // Verify Redis was instantiated with correct config
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'test-redis.cache.amazonaws.com',
          port: 6379,
          tls: {},
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        }),
      );

      // Verify ping was called
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should configure TLS when REDIS_TLS is true', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          tls: {},
        }),
      );
    });

    it('should not configure TLS when REDIS_TLS is false', async () => {
      const mockConfigNoTls = {
        get: jest.fn((key: string) => {
          const config = {
            REDIS_HOST: 'test-redis.cache.amazonaws.com',
            REDIS_PORT: 6379,
            REDIS_TLS: 'false',
          };
          return config[key];
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigNoTls,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          tls: undefined,
        }),
      );
    });
  });

  describe('Connection Success', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();
    });

    it('should return Redis client when connection is successful', () => {
      const client = service.getClient();
      expect(client).toBe(mockRedisClient);
      expect(client).not.toBeNull();
    });

    it('should set healthy status to true when ready event is triggered', () => {
      // Trigger the 'ready' event
      const readyHandler = mockRedisClient['_eventHandlers']['ready'];
      if (readyHandler) readyHandler();

      expect(service.isHealthy()).toBe(true);
      expect(loggerLogSpy).toHaveBeenCalledWith(
        'Redis connection established successfully',
        expect.objectContaining({
          host: 'test-redis.cache.amazonaws.com',
          port: 6379,
          tls: true,
        }),
      );
    });

    it('should log connection progress', () => {
      // Trigger connection events
      const connectHandler = mockRedisClient['_eventHandlers']['connect'];
      if (connectHandler) connectHandler();

      expect(loggerLogSpy).toHaveBeenCalledWith('Redis client connecting...');
    });
  });

  describe('Connection Failure', () => {
    it('should handle missing REDIS_HOST configuration', async () => {
      const mockConfigNoHost = {
        get: jest.fn((key: string) => {
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_TLS') return 'true';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigNoHost,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Redis configuration missing - REDIS_HOST or REDIS_PORT not set',
      );
      expect(service.getClient()).toBeNull();
      expect(service.isHealthy()).toBe(false);
    });

    it('should handle missing REDIS_PORT configuration', async () => {
      const mockConfigNoPort = {
        get: jest.fn((key: string) => {
          if (key === 'REDIS_HOST') return 'test-redis.cache.amazonaws.com';
          if (key === 'REDIS_TLS') return 'true';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigNoPort,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Redis configuration missing - REDIS_HOST or REDIS_PORT not set',
      );
      expect(service.getClient()).toBeNull();
    });

    it('should return null client when ping fails', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection timeout'));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      expect(service.getClient()).toBeNull();
      expect(service.isHealthy()).toBe(false);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Redis initialization failed - application will continue with degraded functionality',
        expect.objectContaining({
          error: 'Connection timeout',
        }),
      );
    });

    it('should set healthy status to false when error event is triggered', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      // First set it to healthy
      const readyHandler = mockRedisClient['_eventHandlers']['ready'];
      if (readyHandler) readyHandler();
      expect(service.isHealthy()).toBe(true);

      // Then trigger error
      const errorHandler = mockRedisClient['_eventHandlers']['error'];
      if (errorHandler) errorHandler(new Error('Connection lost'));

      expect(service.isHealthy()).toBe(false);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Redis connection error',
        expect.objectContaining({
          error: 'Connection lost',
        }),
      );
    });

    it('should set healthy status to false when close event is triggered', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      // First set it to healthy
      const readyHandler = mockRedisClient['_eventHandlers']['ready'];
      if (readyHandler) readyHandler();

      // Then trigger close
      const closeHandler = mockRedisClient['_eventHandlers']['close'];
      if (closeHandler) closeHandler();

      expect(service.isHealthy()).toBe(false);
      expect(loggerWarnSpy).toHaveBeenCalledWith('Redis connection closed');
    });
  });

  describe('Retry Logic', () => {
    it('should implement exponential backoff retry strategy', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      // Extract the retry strategy from the Redis constructor call
      const redisConfig = (Redis as unknown as jest.Mock).mock.calls[0][0];
      const retryStrategy = redisConfig.retryStrategy;

      // Test retry delays: 1s, 2s, 4s
      expect(retryStrategy(1)).toBe(1000);
      expect(retryStrategy(2)).toBe(2000);
      expect(retryStrategy(3)).toBe(4000);
      expect(retryStrategy(4)).toBeNull(); // Stop after 3 attempts
    });

    it('should log reconnection attempts', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      // Trigger reconnecting event
      const reconnectingHandler = mockRedisClient['_eventHandlers']['reconnecting'];
      if (reconnectingHandler) reconnectingHandler();

      expect(loggerLogSpy).toHaveBeenCalledWith('Redis client reconnecting...');
    });
  });

  describe('Module Lifecycle', () => {
    it('should disconnect Redis client on module destroy', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(loggerLogSpy).toHaveBeenCalledWith('Redis client disconnected');
    });

    it('should handle module destroy when client is null', async () => {
      const mockConfigNoHost = {
        get: jest.fn(() => undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigNoHost,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();
      
      // Should not throw error
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('getClient method', () => {
    it('should return the Redis client when available', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      const client = service.getClient();
      expect(client).toBe(mockRedisClient);
      expect(client).not.toBeNull();
    });

    it('should return null when Redis initialization failed', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Network error'));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      expect(service.getClient()).toBeNull();
    });
  });

  describe('isHealthy method', () => {
    it('should return false initially', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      
      // Before initialization
      expect(service.isHealthy()).toBe(false);
    });

    it('should return true after successful connection', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      // Trigger ready event
      const readyHandler = mockRedisClient['_eventHandlers']['ready'];
      if (readyHandler) readyHandler();

      expect(service.isHealthy()).toBe(true);
    });

    it('should return false after connection error', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<RedisService>(RedisService);
      await service.onModuleInit();

      // Set to healthy first
      const readyHandler = mockRedisClient['_eventHandlers']['ready'];
      if (readyHandler) readyHandler();

      // Then trigger error
      const errorHandler = mockRedisClient['_eventHandlers']['error'];
      if (errorHandler) errorHandler(new Error('Connection failed'));

      expect(service.isHealthy()).toBe(false);
    });
  });
});
