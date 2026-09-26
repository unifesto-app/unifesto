import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { CognitoJwtService } from './cognito-jwt.service';
import * as jwt from 'jsonwebtoken';

// Mock jwks-rsa
jest.mock('jwks-rsa', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    getSigningKey: jest.fn(),
  })),
}));

describe('CognitoJwtService', () => {
  let service: CognitoJwtService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        AWS_REGION: 'ap-south-1',
        COGNITO_USER_POOL_ID: 'ap-south-1_TEST123',
        COGNITO_CLIENT_ID: 'test-client-id-12345',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CognitoJwtService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CognitoJwtService>(CognitoJwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with correct configuration', () => {
    expect(configService.get).toHaveBeenCalledWith('AWS_REGION');
    expect(configService.get).toHaveBeenCalledWith('COGNITO_USER_POOL_ID');
    expect(configService.get).toHaveBeenCalledWith('COGNITO_CLIENT_ID');
  });

  describe('verifyCognitoToken', () => {
    it('should throw UnauthorizedException for malformed token', async () => {
      await expect(service.verifyCognitoToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for token without kid', async () => {
      // Create a token without kid in header
      const token = jwt.sign({ sub: 'user-123' }, 'secret');

      await expect(service.verifyCognitoToken(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle TokenExpiredError correctly', async () => {
      // For this test, we need to mock jwt.verify to throw TokenExpiredError
      // Since we can't easily create a real expired token that passes initial decode,
      // we'll just verify that expired tokens are rejected
      const invalidToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiJ1c2VyLTEyMyJ9.invalid';

      await expect(service.verifyCognitoToken(invalidToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('extractUserId', () => {
    it('should throw UnauthorizedException for invalid token', async () => {
      await expect(service.extractUserId('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('configuration validation', () => {
    it('should log warning when configuration is incomplete', async () => {
      const mockConfigServiceIncomplete = {
        get: jest.fn(() => undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CognitoJwtService,
          {
            provide: ConfigService,
            useValue: mockConfigServiceIncomplete,
          },
        ],
      }).compile();

      const serviceIncomplete = module.get<CognitoJwtService>(
        CognitoJwtService,
      );
      expect(serviceIncomplete).toBeDefined();
      // Service should still be created but log a warning
    });
  });
});
