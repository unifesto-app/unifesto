import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { CognitoJwtService } from './cognito-jwt.service';
import { ThrottleIdentityService } from './throttle-identity.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RedisModule } from '../redis/redis.module';
import { RolesGuard } from './guards/roles.guard';
import { CacheModule } from '../cache/cache.module';
import { AuthorizationService } from './authorization/authorization.service';
import { CapabilityConfigService } from './authorization/capability-config.service';
import { CanGuard } from './authorization/can.guard';

@Module({
  imports: [ConfigModule, PrismaModule, EmailModule, WhatsAppModule, RedisModule, CacheModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    CognitoJwtService,
    ThrottleIdentityService,
    JwtAuthGuard,
    RolesGuard,
    CapabilityConfigService,
    AuthorizationService,
    CanGuard,
  ],
  exports: [
    AuthService,
    CognitoJwtService,
    ThrottleIdentityService,
    JwtAuthGuard,
    CapabilityConfigService,
    AuthorizationService,
    CanGuard,
  ],
})
export class AuthModule {}