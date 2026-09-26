/// <reference types="jest" />
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from '../auth.service';
import { CognitoJwtService } from '../cognito-jwt.service';
import * as jwt from 'jsonwebtoken';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let authService: any;
  let cognitoJwtService: jest.Mocked<CognitoJwtService>;

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

  const mockCognitoPayload = {
    sub: 'cognito-user-456',
    email: 'test@example.com',
    email_verified: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: AuthService,
          useValue: {
            validateAccessToken: jest.fn(),
            getUserById: jest.fn(),
            touchLastSeen: jest.fn(),
          },
        },
        {
          provide: CognitoJwtService,
          useValue: {
            verifyCognitoToken: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    authService = module.get(AuthService) as any;
    cognitoJwtService = module.get(CognitoJwtService) as jest.Mocked<CognitoJwtService>;
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

  describe('Custom JWT Token Verification', () => {
    const customJwtToken = jwt.sign({ userId: 'user-123' }, 'test-secret', {
      expiresIn: '1h',
    });

    it('should successfully verify custom JWT token', async () => {
      const context = createMockExecutionContext(`Bearer ${customJwtToken}`);
      authService.validateAccessToken.mockResolvedValue(mockUser);

      const result = await guard.canActivate(context);
      const request = context.switchToHttp().getRequest();

      expect(result).toBe(true);
      expect(request.user).toEqual(mockUser);
      expect(authService.validateAccessToken).toHaveBeenCalledWith(customJwtToken);
      expect(cognitoJwtService.verifyCognitoToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when custom JWT is invalid', async () => {
      const context = createMockExecutionContext(`Bearer ${customJwtToken}`);
      authService.validateAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(authService.validateAccessToken).toHaveBeenCalledWith(customJwtToken);
    });

    it('should throw UnauthorizedException when custom JWT is expired', async () => {
      const expiredToken = jwt.sign({ userId: 'user-123' }, 'test-secret', {
        expiresIn: '-1h', // Already expired
      });
      const context = createMockExecutionContext(`Bearer ${expiredToken}`);
      authService.validateAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid or expired token'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Cognito JWT Token Verification', () => {
    const cognitoJwtToken = jwt.sign(
      {
        sub: 'cognito-user-456',
        email: 'test@example.com',
        token_use: 'access',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
      },
      'test-secret',
      { expiresIn: '1h' },
    );

    it('should successfully verify Cognito JWT token', async () => {
      const context = createMockExecutionContext(`Bearer ${cognitoJwtToken}`);
      cognitoJwtService.verifyCognitoToken.mockResolvedValue(mockCognitoPayload);
      authService.getUserById.mockResolvedValue(mockUser);

      const result = await guard.canActivate(context);
      const request = context.switchToHttp().getRequest();

      expect(result).toBe(true);
      expect(request.user).toEqual(mockUser);
      expect(cognitoJwtService.verifyCognitoToken).toHaveBeenCalledWith(cognitoJwtToken);
      expect(authService.getUserById).toHaveBeenCalledWith('cognito-user-456');
      expect(authService.validateAccessToken).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when Cognito JWT is invalid', async () => {
      const context = createMockExecutionContext(`Bearer ${cognitoJwtToken}`);
      cognitoJwtService.verifyCognitoToken.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(cognitoJwtService.verifyCognitoToken).toHaveBeenCalledWith(cognitoJwtToken);
    });

    it('should throw UnauthorizedException when Cognito JWT is expired', async () => {
      const context = createMockExecutionContext(`Bearer ${cognitoJwtToken}`);
      cognitoJwtService.verifyCognitoToken.mockRejectedValue(
        new UnauthorizedException('Token expired'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Token expired'),
      );
    });

    it('should throw UnauthorizedException when user not found for Cognito token', async () => {
      const context = createMockExecutionContext(`Bearer ${cognitoJwtToken}`);
      cognitoJwtService.verifyCognitoToken.mockResolvedValue(mockCognitoPayload);
      authService.getUserById.mockRejectedValue(
        new UnauthorizedException('User not found'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });
  });

  describe('Token Type Detection', () => {
    it('should detect Cognito JWT by iss claim containing cognito-idp', async () => {
      const cognitoToken = jwt.sign(
        {
          sub: 'cognito-user',
          iss: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_ABC123',
          token_use: 'id',
        },
        'secret',
      );
      const context = createMockExecutionContext(`Bearer ${cognitoToken}`);
      cognitoJwtService.verifyCognitoToken.mockResolvedValue(mockCognitoPayload);
      authService.getUserById.mockResolvedValue(mockUser);

      await guard.canActivate(context);

      expect(cognitoJwtService.verifyCognitoToken).toHaveBeenCalled();
      expect(authService.validateAccessToken).not.toHaveBeenCalled();
    });

    it('should detect custom JWT by absence of Cognito claims', async () => {
      const customToken = jwt.sign({ userId: 'user-123' }, 'secret');
      const context = createMockExecutionContext(`Bearer ${customToken}`);
      authService.validateAccessToken.mockResolvedValue(mockUser);

      await guard.canActivate(context);

      expect(authService.validateAccessToken).toHaveBeenCalled();
      expect(cognitoJwtService.verifyCognitoToken).not.toHaveBeenCalled();
    });

    it('should default to custom JWT when token is malformed', async () => {
      const malformedToken = 'not.a.valid.jwt.token';
      const context = createMockExecutionContext(`Bearer ${malformedToken}`);
      authService.validateAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid token'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(authService.validateAccessToken).toHaveBeenCalled();
      expect(cognitoJwtService.verifyCognitoToken).not.toHaveBeenCalled();
    });

    it('should treat token with iss but no token_use as custom JWT', async () => {
      const ambiguousToken = jwt.sign(
        {
          userId: 'user-123',
          iss: 'https://some-other-issuer.com',
          // No token_use claim
        },
        'secret',
      );
      const context = createMockExecutionContext(`Bearer ${ambiguousToken}`);
      authService.validateAccessToken.mockResolvedValue(mockUser);

      await guard.canActivate(context);

      expect(authService.validateAccessToken).toHaveBeenCalled();
      expect(cognitoJwtService.verifyCognitoToken).not.toHaveBeenCalled();
    });

    it('should treat token with token_use but no cognito-idp iss as custom JWT', async () => {
      const ambiguousToken = jwt.sign(
        {
          userId: 'user-123',
          token_use: 'access',
          iss: 'https://some-other-service.com',
        },
        'secret',
      );
      const context = createMockExecutionContext(`Bearer ${ambiguousToken}`);
      authService.validateAccessToken.mockResolvedValue(mockUser);

      await guard.canActivate(context);

      expect(authService.validateAccessToken).toHaveBeenCalled();
      expect(cognitoJwtService.verifyCognitoToken).not.toHaveBeenCalled();
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

    it('should handle Cognito service errors gracefully', async () => {
      const cognitoToken = jwt.sign(
        {
          sub: 'cognito-user',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/pool',
          token_use: 'access',
        },
        'secret',
      );
      const context = createMockExecutionContext(`Bearer ${cognitoToken}`);
      cognitoJwtService.verifyCognitoToken.mockRejectedValue(
        new Error('JWKS endpoint unreachable'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid Cognito token'),
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('should continue to work with existing custom JWT tokens', async () => {
      // This test ensures that all existing authentication flows remain functional
      const existingToken = jwt.sign(
        { userId: 'existing-user-id' },
        'secret',
        { expiresIn: '7d' },
      );
      const context = createMockExecutionContext(`Bearer ${existingToken}`);
      authService.validateAccessToken.mockResolvedValue(mockUser);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateAccessToken).toHaveBeenCalledWith(existingToken);
    });

    it('should attach user object to request for both token types', async () => {
      // Test custom JWT
      const customToken = jwt.sign({ userId: 'user-123' }, 'secret');
      const customContext = createMockExecutionContext(`Bearer ${customToken}`);
      authService.validateAccessToken.mockResolvedValue(mockUser);

      await guard.canActivate(customContext);
      expect(customContext.switchToHttp().getRequest().user).toEqual(mockUser);

      // Test Cognito JWT
      const cognitoToken = jwt.sign(
        {
          sub: 'cognito-user',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/pool',
          token_use: 'access',
        },
        'secret',
      );
      const cognitoContext = createMockExecutionContext(`Bearer ${cognitoToken}`);
      cognitoJwtService.verifyCognitoToken.mockResolvedValue(mockCognitoPayload);
      authService.getUserById.mockResolvedValue(mockUser);

      await guard.canActivate(cognitoContext);
      expect(cognitoContext.switchToHttp().getRequest().user).toEqual(mockUser);
    });
  });
});
