import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_LENGTH = 6;
  private readonly OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async storeOtp(identifier: string, otp: string): Promise<void> {
    const key = `otp:${identifier}`;
    const data = JSON.stringify({ otp, attempts: 0 });
    await this.redisService.set(key, data, this.OTP_EXPIRY_SECONDS);
    this.logger.log(`OTP stored in Redis for ${identifier}`);
  }

  async verifyOtp(identifier: string, otp: string): Promise<boolean> {
    const key = `otp:${identifier}`;
    const raw = await this.redisService.get(key);

    if (!raw) {
      this.logger.warn(`No OTP found for ${identifier}`);
      return false;
    }

    const data = JSON.parse(raw);

    if (data.attempts >= this.MAX_ATTEMPTS) {
      this.logger.warn(`Max attempts reached for ${identifier}`);
      await this.redisService.del(key);
      return false;
    }

    data.attempts++;
    await this.redisService.set(
      key,
      JSON.stringify(data),
      this.OTP_EXPIRY_SECONDS,
    );

    if (data.otp === otp) {
      this.logger.log(`OTP verified for ${identifier}`);
      await this.redisService.del(key);
      return true;
    }

    this.logger.warn(
      `Invalid OTP for ${identifier}. Attempt ${data.attempts}/${this.MAX_ATTEMPTS}`,
    );
    return false;
  }

  async hasValidOtp(identifier: string): Promise<boolean> {
    const key = `otp:${identifier}`;
    const raw = await this.redisService.get(key);
    return !!raw;
  }

  async deleteOtp(identifier: string): Promise<void> {
    const key = `otp:${identifier}`;
    await this.redisService.del(key);
  }
}
