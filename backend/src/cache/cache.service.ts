import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { OrgPlan } from '@prisma/client';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  // =====================================================
  // 1. PLAN LIMITS CACHE
  // =====================================================

  async getUserPlan(userId: string): Promise<OrgPlan | null> {
    try {
      const cacheKey = `plan:${userId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return cached as OrgPlan;
      }
      
      this.logger.debug(`Cache miss: ${cacheKey}`);
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for plan:${userId}`, error);
      return null;
    }
  }

  async setUserPlan(userId: string, plan: OrgPlan): Promise<void> {
    try {
      const cacheKey = `plan:${userId}`;
      await this.redis.set(cacheKey, plan, 3600);
      this.logger.debug(`Cache set: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Cache set error for plan:${userId}`, error);
    }
  }

  async invalidatePlanCache(userId: string): Promise<void> {
    try {
      const cacheKey = `plan:${userId}`;
      await this.redis.del(cacheKey);
      this.logger.debug(`Cache invalidated: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Cache delete error for plan:${userId}`, error);
    }
  }

  // --- Per-space plan cache (P0.2: billing subject is the Space) -------------
  // Keyed separately from the legacy per-user cache so a user running several
  // spaces on different plans never collides on one entry.

  async getSpacePlan(spaceId: string): Promise<OrgPlan | null> {
    try {
      const cached = await this.redis.get(`plan:space:${spaceId}`);
      return cached ? (cached as OrgPlan) : null;
    } catch (error) {
      this.logger.error(`Cache get error for plan:space:${spaceId}`, error);
      return null;
    }
  }

  async setSpacePlan(spaceId: string, plan: OrgPlan): Promise<void> {
    try {
      await this.redis.set(`plan:space:${spaceId}`, plan, 3600);
    } catch (error) {
      this.logger.error(`Cache set error for plan:space:${spaceId}`, error);
    }
  }

  async invalidateSpacePlanCache(spaceId: string): Promise<void> {
    try {
      await this.redis.del(`plan:space:${spaceId}`);
    } catch (error) {
      this.logger.error(`Cache delete error for plan:space:${spaceId}`, error);
    }
  }

  // =====================================================
  // 3. CHECK-IN CACHE
  // =====================================================

  async getCheckinCache(eventId: string): Promise<any[] | null> {
    try {
      const cacheKey = `checkin:cache:${eventId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return JSON.parse(cached);
      }
      
      this.logger.debug(`Cache miss: ${cacheKey}`);
      return null;
    } catch (error) {
      this.logger.error(`Get checkin cache error for event:${eventId}`, error);
      return null;
    }
  }

  async getEventRegistrationsForCheckin(eventId: string): Promise<any[] | null> {
    return this.getCheckinCache(eventId);
  }

  async setCheckinCache(eventId: string, registrations: any[]): Promise<void> {
    try {
      const cacheKey = `checkin:cache:${eventId}`;
      await this.redis.set(cacheKey, JSON.stringify(registrations), 3600);
      this.logger.debug(`Cache set: ${cacheKey} with ${registrations.length} registrations`);
    } catch (error) {
      this.logger.error(`Set checkin cache error for event:${eventId}`, error);
    }
  }

  async setEventRegistrationsForCheckin(eventId: string, registrations: any[]): Promise<void> {
    return this.setCheckinCache(eventId, registrations);
  }

  async invalidateCheckinCache(eventId: string): Promise<void> {
    try {
      const cacheKey = `checkin:cache:${eventId}`;
      await this.redis.del(cacheKey);
      this.logger.debug(`Cache invalidated: ${cacheKey}`);
    } catch (error) {
      this.logger.error(`Invalidate checkin cache error for event:${eventId}`, error);
    }
  }

  // =====================================================
  // 5. EVENT DETAILS CACHE
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

  // =====================================================
  // 6. TRENDING EVENTS (Sorted Set)
  // =====================================================

  async incrementEventScore(eventId: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (!client) {
        this.logger.warn('Redis client not available for trending events');
        return;
      }

      await client.zincrby('trending:events', 1, eventId);
      this.logger.debug(`Incremented trending score for event:${eventId}`);
    } catch (error) {
      this.logger.error(`Increment event score error for event:${eventId}`, error);
    }
  }

  async getTrendingEventIds(limit = 10): Promise<string[]> {
    try {
      const client = this.redis.getClient();
      if (!client) {
        this.logger.warn('Redis client not available for trending events');
        return [];
      }

      const eventIds = await client.zrevrange('trending:events', 0, limit - 1);
      this.logger.debug(`Retrieved ${eventIds.length} trending event IDs`);
      return eventIds;
    } catch (error) {
      this.logger.error('Get trending events error', error);
      return [];
    }
  }

  // =====================================================
  // 7. LIVE VIEW COUNT
  // =====================================================

  async incrementEventViews(eventId: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (!client) return;

      await client.incr(`event:views:${eventId}`);
      this.logger.debug(`Incremented view count for event:${eventId}`);
    } catch (error) {
      this.logger.error(`Increment event views error for event:${eventId}`, error);
    }
  }

  async getEventViews(eventId: string): Promise<number> {
    try {
      const client = this.redis.getClient();
      if (!client) return 0;

      const count = await client.get(`event:views:${eventId}`);
      return parseInt(count || '0');
    } catch (error) {
      this.logger.error(`Get event views error for event:${eventId}`, error);
      return 0;
    }
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  async clearAllCache(): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (!client) {
        this.logger.warn('Redis client not available for cache clear');
        return;
      }

      // This is a dangerous operation - use with caution
      // await client.flushdb();
      this.logger.warn('Clear all cache called - implement with caution');
    } catch (error) {
      this.logger.error('Clear all cache error', error);
    }
  }

  async getCacheStats(): Promise<any> {
    try {
      const client = this.redis.getClient();
      if (!client) return { available: false };

      const info = await client.info('stats');
      return {
        available: true,
        info,
      };
    } catch (error) {
      this.logger.error('Get cache stats error', error);
      return { available: false, error: error.message };
    }
  }
}
