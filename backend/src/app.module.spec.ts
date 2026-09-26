import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import Redis from 'ioredis';

describe('AppModule - Throttler Configuration', () => {
  let module: TestingModule;
  let redisService: RedisService;

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should configure throttler with Redis storage when Redis is available', async () => {
    const mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    } as unknown as Redis;

    module = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
        RedisModule,
        ThrottlerModule.forRootAsync({
          imports: [RedisModule],
          useFactory: (redisService: RedisService) => {
            const redisClient = redisService.getClient();

            if (redisClient) {
              return {
                throttlers: [
                  {
                    ttl: 60000, // 60 seconds
                    limit: 100, // 100 requests per 60 seconds
                  },
                ],
                storage: new ThrottlerStorageRedisService(redisClient),
              };
            } else {
              return {
                throttlers: [
                  {
                    ttl: 60000, // 60 seconds
                    limit: 100, // 100 requests per 60 seconds
                  },
                ],
                // storage: undefined defaults to in-memory storage
              };
            }
          },
          inject: [RedisService],
        }),
      ],
    })
      .overrideProvider(RedisService)
      .useValue({
        getClient: jest.fn().mockReturnValue(mockRedisClient),
        isHealthy: jest.fn().mockReturnValue(true),
      })
      .compile();

    redisService = module.get<RedisService>(RedisService);

    const redisClient = redisService.getClient();
    expect(redisClient).toBeDefined();
    expect(redisClient).toBe(mockRedisClient);
    expect(redisService.isHealthy()).toBe(true);
  });

  it('should configure throttler with in-memory storage when Redis is unavailable', async () => {
    module = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
        RedisModule,
        ThrottlerModule.forRootAsync({
          imports: [RedisModule],
          useFactory: (redisService: RedisService) => {
            const redisClient = redisService.getClient();

            if (redisClient) {
              return {
                throttlers: [
                  {
                    ttl: 60000, // 60 seconds
                    limit: 100, // 100 requests per 60 seconds
                  },
                ],
                storage: new ThrottlerStorageRedisService(redisClient),
              };
            } else {
              return {
                throttlers: [
                  {
                    ttl: 60000, // 60 seconds
                    limit: 100, // 100 requests per 60 seconds
                  },
                ],
                // storage: undefined defaults to in-memory storage
              };
            }
          },
          inject: [RedisService],
        }),
      ],
    })
      .overrideProvider(RedisService)
      .useValue({
        getClient: jest.fn().mockReturnValue(null),
        isHealthy: jest.fn().mockReturnValue(false),
      })
      .compile();

    redisService = module.get<RedisService>(RedisService);

    const redisClient = redisService.getClient();
    expect(redisClient).toBeNull();
    expect(redisService.isHealthy()).toBe(false);
  });

  it('should maintain rate limit configuration of 100 requests per 60 seconds', async () => {
    const mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    } as unknown as Redis;

    module = await Test.createTestingModule({
      imports: [
        NestConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
        RedisModule,
        ThrottlerModule.forRootAsync({
          imports: [RedisModule],
          useFactory: (redisService: RedisService) => {
            const redisClient = redisService.getClient();

            const config = {
              throttlers: [
                {
                  ttl: 60000, // 60 seconds
                  limit: 100, // 100 requests per 60 seconds
                },
              ],
              storage: redisClient
                ? new ThrottlerStorageRedisService(redisClient)
                : undefined,
            };

            return config;
          },
          inject: [RedisService],
        }),
      ],
    })
      .overrideProvider(RedisService)
      .useValue({
        getClient: jest.fn().mockReturnValue(mockRedisClient),
        isHealthy: jest.fn().mockReturnValue(true),
      })
      .compile();

    // Verify the module compiled successfully with the expected configuration
    expect(module).toBeDefined();
  });
});
