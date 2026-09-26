/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { OtpService } from './otp.service';
import { CognitoJwtService } from './cognito-jwt.service';
import { CacheService } from '../cache/cache.service';

/**
 * Test suite for AuthService.getUserById method
 * This method is used by JwtAuthGuard when verifying Cognito JWT tokens
 */
describe('AuthService - getUserById', () => {
  let authService: AuthService;
  let prismaService: any;

  const mockUser = {
    id: 'user-123',
    mobileNumber: '+1234567890',
    mobileVerified: true,
    username: 'testuser',
    fullName: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                JWT_SECRET: 'test-secret',
                JWT_EXPIRES_IN: '7d',
                GOOGLE_CLIENT_ID: 'test-google-client-id',
                APPLE_CLIENT_ID: 'test-apple-client-id',
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendOtpEmail: jest.fn(),
          },
        },
        {
          provide: WhatsAppService,
          useValue: {
            sendOtp: jest.fn(),
            sendWelcomeMessage: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: {
            generateOtp: jest.fn(),
            storeOtp: jest.fn(),
            verifyOtp: jest.fn(),
          },
        },
        {
          provide: CognitoJwtService,
          useValue: {
            verifyCognitoToken: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            isOtpBlocked: jest.fn(),
            trackFailedOtp: jest.fn(),
            clearFailedOtp: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService) as any;
  });

  describe('getUserById', () => {
    it('should return user when user exists', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await authService.getUserById('user-123');

      expect(result).toEqual(mockUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(authService.getUserById('non-existent-user')).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'non-existent-user' },
      });
    });

    it('should handle database errors gracefully', async () => {
      prismaService.user.findUnique.mockRejectedValue(
        new Error('Database connection error'),
      );

      await expect(authService.getUserById('user-123')).rejects.toThrow(
        'Database connection error',
      );
    });

    it('should work with Cognito user IDs (sub claim)', async () => {
      const cognitoUser = {
        ...mockUser,
        id: 'cognito-sub-claim-id',
      };
      prismaService.user.findUnique.mockResolvedValue(cognitoUser as any);

      const result = await authService.getUserById('cognito-sub-claim-id');

      expect(result).toEqual(cognitoUser);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'cognito-sub-claim-id' },
      });
    });
  });
});
