import { User } from '@prisma/client';
import { deletionDueAt } from '../../common/account-deletion';

export class AuthResponseDto {
  accessToken: string;
  /** Long-lived token the app exchanges at /auth/refresh to renew the session. */
  refreshToken?: string;
  user: UserProfileDto;
  requiresMobileVerification: boolean;
  isNewUser?: boolean;
  tempToken?: string;
}

export class UserProfileDto {
  id: string;
  mobileNumber: string;
  mobileVerified: boolean;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  createdAt: string;
  /** Set while a deletion request is pending: when the account will close. */
  deletionScheduledFor: string | null;
  /** Z11: when I confirmed I am 18 or older; null = not yet. */
  ageConfirmedAt: string | null;
  roles?: { role: { code: string; name: string } }[];

  static fromUser(user: User, roles?: any[]): UserProfileDto {
    return {
      id: user.id,
      mobileNumber: user.mobileNumber,
      mobileVerified: user.mobileVerified,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      gender: (user as any).gender ?? null,
      linkedinUrl: user.linkedinUrl,
      instagramUrl: user.instagramUrl,
      githubUrl: user.githubUrl,
      websiteUrl: user.websiteUrl,
      createdAt: user.createdAt.toISOString(),
      deletionScheduledFor: user.deletionRequestedAt
        ? deletionDueAt(user.deletionRequestedAt).toISOString()
        : null,
      ageConfirmedAt: user.ageConfirmedAt?.toISOString() ?? null,
      roles: roles || [],
    };
  }
}
