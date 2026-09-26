export enum UserRole {
  ATTENDEE = "attendee",
  SUPER_ADMIN = "super_admin",
  SUPPORT = "support",
}

export interface Profile {
  id: string;
  name?: string;
  username?: string;
  avatar_url?: string | null;
  bio?: string;
  email?: string;
  phone?: string;
  role: UserRole;
  is_verified: boolean;
  is_active: boolean;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileDto {
  name?: string;
  username?: string;
  avatar_url?: string | null;
  bio?: string;
  phone?: string;
}
