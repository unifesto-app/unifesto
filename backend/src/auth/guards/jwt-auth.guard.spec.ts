/// <reference types="jest" />
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from '../auth.service';
import * as jwt from 'jsonwebtoken';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let authService: any;

  const mockUser = {
    id: 'user-123',
    mobileNumber: '+1234567890',
    mobileVerified: true,
    username: 'testuser',
    createdAt: new Date(),
    updatedAt: new Date(),
    fullName: null,
    avatarUrl: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: AuthService,
          useValue: {
            validateAccessToken: jest.fn(),
            touchLastSeen: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    authService = module.get(AuthService) as any;
  });

  const createMockExecutionContext = (authHeader?: string): ExecutionContext => {
    const mockRequest = {
      headers: {
        authorization: authHeader,
      },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;
  };

  describe('Authorization Header Validation', () => {
    it('should throw UnauthorizedException when no authorization header is present', async () => {
      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('No authorization header'),
      );
    });

    it('should throw UnauthorizedException when authorization header format is invalid', async () => {
      const context = createMockExecutionContext('InvalidFormat token123');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });

    it('should throw UnauthorizedException when token is missing', async () => {
      const context = createMockExecutionContext('Bearer ');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid authorization header format'),
      );
    });
  });

  describe('Token Verification', () => {
    const customJwtToken = jwt.sign({ userId: 'user-123', sid: 'session-1' }, 'test-secret', {
      expiresIn: '1h',
    });

    it('should verify the token, attach the user and the session id', async () => {
      const context = createMockExecutionContext(`Bearer ${customJwtToken}`);
      authService.validateAccessToken.mockResolvedValue(mockUser);

      const result = await guard.canActivate(context);
      const request = context.switchToHttp().getRequest();

      expect(result).toBe(true);
      expect(request.user).toEqual(mockUser);
      expect(request.sessionId).toBe('session-1');
      expect(authService.validateAccessToken).toHaveBeenCalledWith(customJwtToken);
      expect(authService.touchLastSeen).toHaveBeenCalledWith(mockUser);
    });

    it('should throw UnauthorizedException when the token is invalid', async () => {
      const context = createMockExecutionContext(`Bearer ${customJwtToken}`);
      authService.validateAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(authService.validateAccessToken).toHaveBeenCalledWith(customJwtToken);
    });

    it('should throw UnauthorizedException when the token is expired', async () => {
      const expiredToken = jwt.sign({ userId: 'user-123' }, 'test-secret', {
        expiresIn: '-1h', // Already expired
      });
      const context = createMockExecutionContext(`Bearer ${expiredToken}`);
      authService.validateAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired token'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should not accept a Cognito token as a bearer token', async () => {
      const cognitoToken = jwt.sign(
        {
          sub: 'cognito-user',
          iss: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_ABC123',
          token_use: 'id',
        },
        'secret',
      );
      const context = createMockExecutionContext(`Bearer ${cognitoToken}`);
      authService.validateAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired token'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(authService.validateAccessToken).toHaveBeenCalledWith(cognitoToken);
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors during token verification', async () => {
      const customToken = jwt.sign({ userId: 'user-123' }, 'secret');
      const context = createMockExecutionContext(`Bearer ${customToken}`);
      authService.validateAccessToken.mockRejectedValue(new Error('Database error'));

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });

    it('should preserve specific error messages from UnauthorizedException', async () => {
      const customToken = jwt.sign({ userId: 'user-123' }, 'secret');
      const context = createMockExecutionContext(`Bearer ${customToken}`);
      authService.validateAccessToken.mockRejectedValue(
        new UnauthorizedException('Custom error message'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Custom error message'),
      );
    });
  });
});
