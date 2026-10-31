import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  // =====================================================
  // EVENT DETAILS CACHE
  // =====================================================

  async getCachedEvent(slug: string): Promise<any | null> {
    try {
      const cacheKey = `event:details:${slug}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return JSON.parse(cached);
      }
      
      this.logger.debug(`Cache miss: ${cacheKey}`);
      return null;
    } catch (error) {
      this.logger.error(`Get event cache error for slug:${slug}`, error);
      return null;
    }
  }

  async setCachedEvent(slug: string, event: any): Promise<void> {
    try {
      const cacheKey = `event:details:${slug}`;
      await this.redis.set(cacheKey, JSON.stringify(event), 600);
      this.logger.debug(`Cache set: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Set event cache error for slug:${slug}`, error);
    }
  }

  async invalidateEventCache(slug: string): Promise<void> {
    try {
      const cacheKey = `event:details:${slug}`;
      await this.redis.del(cacheKey);
      this.logger.debug(`Cache invalidated: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Invalidate event cache error for slug:${slug}`, error);
    }
  }
}
