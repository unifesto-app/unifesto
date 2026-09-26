import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

/**
 * Interface for decoded Cognito JWT token payload
 */
export interface CognitoTokenPayload {
  sub: string; // Cognito user ID
  email?: string;
  email_verified?: boolean;
  iat: number;
  exp: number;
  token_use?: string;
  iss?: string;
  aud?: string;
}

/**
 * Service for verifying AWS Cognito JWT tokens
 * Uses JWKS (JSON Web Key Set) for signature verification
 */
@Injectable()
export class CognitoJwtService {
  private readonly logger = new Logger(CognitoJwtService.name);
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly region: string;
  private readonly userPoolId: string;
  private readonly clientId: string;
  private readonly issuer: string;

  constructor(private configService: ConfigService) {
    // Get configuration from environment variables
    this.region = this.configService.get<string>('AWS_REGION') || '';
    this.userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID') || '';
    this.clientId = this.configService.get<string>('COGNITO_CLIENT_ID') || '';

    // Validate required configuration
    if (!this.region || !this.userPoolId || !this.clientId) {
      this.logger.warn(
        'Cognito configuration incomplete. CognitoJwtService will not function properly.',
      );
    }

    // Construct Cognito issuer URL
    this.issuer = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;

    // Initialize JWKS client with Cognito's public keys endpoint
    const jwksUri = `${this.issuer}/.well-known/jwks.json`;
    
    this.jwksClient = jwksClient({
      jwksUri,
      cache: true, // Cache keys for better performance
      cacheMaxAge: 24 * 60 * 60 * 1000, // Cache for 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });

    this.logger.log(
      `CognitoJwtService initialized for region: ${this.region}, userPoolId: ${this.userPoolId}`,
    );
  }

  /**
   * Get the signing key from JWKS endpoint
   * @param kid - Key ID from JWT header
   * @returns Signing key for verification
   */
  private async getSigningKey(kid: string): Promise<string> {
    try {
      const key = await this.jwksClient.getSigningKey(kid);
      return key.getPublicKey();
    } catch (error) {
      this.logger.error('Failed to fetch signing key from JWKS', {
        kid,
        error: error.message,
      });
      throw new UnauthorizedException('Unable to verify token signature');
    }
  }

  /**
   * Verify Cognito JWT token and extract user information
   * Validates:
   * - Token signature using JWKS
   * - Token expiration
   * - Token issuer
   * - Token audience (client ID)
   * 
   * @param token - JWT token from Authorization header
   * @returns Decoded token payload with userId from 'sub' claim
   * @throws UnauthorizedException if token is invalid or expired
   */
  async verifyCognitoToken(token: string): Promise<CognitoTokenPayload> {
    try {
      // Decode token without verification to get header (contains 'kid')
      const decodedToken = jwt.decode(token, { complete: true });

      if (!decodedToken || typeof decodedToken === 'string') {
        this.logger.warn('Token verification failed: malformed token');
        throw new UnauthorizedException('Invalid token');
      }

      const { kid } = decodedToken.header;

      if (!kid) {
        this.logger.warn('Token verification failed: missing kid in header');
        throw new UnauthorizedException('Invalid token');
      }

      // Get the signing key from JWKS
      const signingKey = await this.getSigningKey(kid);

      // Verify the token signature, expiration, issuer, and audience
      const verified = jwt.verify(token, signingKey, {
        algorithms: ['RS256'], // Cognito uses RS256
        issuer: this.issuer,
        audience: this.clientId,
      }) as CognitoTokenPayload;

      this.logger.debug('Token verified successfully', {
        userId: verified.sub,
      });

      return verified;
    } catch (error) {
      // Handle specific JWT errors
      if (error.name === 'TokenExpiredError') {
        this.logger.warn('Token verification failed: token expired');
        throw new UnauthorizedException('Token expired');
      }

      if (error.name === 'JsonWebTokenError') {
        this.logger.warn('Token verification failed: invalid token', {
          reason: error.message,
        });
        throw new UnauthorizedException('Invalid token');
      }

      if (error.name === 'NotBeforeError') {
        this.logger.warn('Token verification failed: token not yet valid');
        throw new UnauthorizedException('Invalid token');
      }

      // If already an UnauthorizedException, re-throw it
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Log unexpected errors without exposing token
      this.logger.error('Unexpected error during token verification', {
        errorName: error.name,
        errorMessage: error.message,
      });
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Extract userId from Cognito JWT token
   * Convenience method that verifies token and returns just the userId
   * 
   * @param token - JWT token from Authorization header
   * @returns User ID from the 'sub' claim
   * @throws UnauthorizedException if token is invalid or expired
   */
  async extractUserId(token: string): Promise<string> {
    const payload = await this.verifyCognitoToken(token);
    return payload.sub;
  }
}
