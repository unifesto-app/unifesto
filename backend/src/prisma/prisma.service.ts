import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        // Query events only in development: in prod Prisma would build an
        // event for every query even though nothing listens.
        ...(process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' } as const]
          : []),
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'pretty',
    });

    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: any) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }

    // Log errors
    this.$on('error' as never, (e: any) => {
      this.logger.error(`Prisma Error: ${e.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to database with SSL');
    } catch (error) {
      const maskedUrl = this.maskDatabaseUrl(process.env.DATABASE_URL);
      this.logger.error('Failed to connect to database', {
        connectionString: maskedUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mask sensitive credentials in database URL
   * @param url Database connection string
   * @returns Masked URL with credentials hidden
   */
  private maskDatabaseUrl(url: string | undefined): string {
    if (!url) return 'DATABASE_URL not set';
    
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '****';
      }
      if (urlObj.username) {
        urlObj.username = urlObj.username.substring(0, 3) + '***';
      }
      return urlObj.toString();
    } catch {
      return 'Invalid DATABASE_URL format';
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
