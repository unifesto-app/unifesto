# Profile Screens Update

## Overview
Implemented a complete profile management system with three main screens following Instagram-style design patterns and consistent card layouts.

## Screens Implemented

### 1. User Profile Screen (`UserProfileScreen.tsx`)
**Route:** `/user-profile`
**Purpose:** Instagram-style profile view (read-only)

**Features:**
- Avatar with stats (Events, Tickets, Coins)
- Display name, username, and bio
- "Edit Profile" button → navigates to Edit Profile screen
- Settings icon button (placeholder)
- Tabs for Events and Tickets (with empty state)
- Accessible from Profile screen header card

**Layout:**
- Header section with avatar and stats in horizontal layout
- Profile info section with name, username, bio
- Action buttons (Edit Profile + Settings)
- Tab navigation
- Content area with empty state

### 2. Edit Profile Screen (`EditProfileScreen.tsx`)
**Route:** `/edit-profile`
**Purpose:** Edit user profile information

**Features:**
- Avatar upload with camera badge
- Full Name input
- Bio textarea
- Social links (LinkedIn, Instagram, GitHub, Website) with icons
- Message: "💡 You can edit your username in Account Settings"
- Save button with loading state

**Layout:**
- Avatar section (centered, with change photo button)
- Basic Information card (Name, Bio)
- Username message box
- Social Links card (all social inputs with icons)
- Save button at bottom

**Card Style:**
- Same as Profile screen
- Background: `colors.card`
- Border radius: `borderRadius['2xl']`
- Padding: `spacing[5]`
- Shadows: `shadows.lg`

### 3. Account Settings Screen (`AccountSettingsScreen.tsx`)
**Route:** `/account` (updated from old AccountScreen)
**Purpose:** Manage account settings and security

**Features:**
- **Username:** Editable inline with save/cancel buttons
  - Checks username availability before saving
  - Shows error messages for taken usernames
- **Phone Number:** Display only (from `profile.mobileNumber`)
- **Linked Accounts:** Shows all connected auth providers (Google, Apple, Email)
  - Displays provider name, email, and verification status
- **Delete Account:** Danger zone with confirmation dialog

**Layout:**
- Section: Account Information
  - Username (editable)
  - Phone Number (read-only)
- Section: Linked Accounts
  - List of connected providers with verification badges
- Section: Danger Zone
  - Delete account card with warning

**Card Style:**
- Consistent with Profile screen
- Menu items with icon containers (36x36)
- Dividers between items
- Danger card with red tint

## Navigation Flow

```
ProfileScreen (header card)
  → UserProfileScreen
      → EditProfileScreen
          ← Save → Back to UserProfileScreen

ProfileScreen (Account Settings menu item)
  → AccountSettingsScreen
```

## API Integration

### Edit Profile Screen
- `AuthAPI.getCurrentUser()` - Load profile data
- `AuthAPI.uploadAvatar()` - Upload new avatar
- `AuthAPI.updateUserProfile()` - Update name, bio, social links

### Account Settings Screen
- `AuthAPI.getCurrentUser()` - Load profile data
- `AuthAPI.getUserIdentities()` - Load linked accounts
- `AuthAPI.checkUsernameAvailability()` - Check if username is available
- `AuthAPI.updateUserProfile()` - Update username

### User Profile Screen
- `AuthAPI.getCurrentUser()` - Load profile data for display

## User Type Fields Used

```typescript
interface User {
  id: string;
  mobileNumber: string;
  mobileVerified: boolean;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  isOnboarded: boolean;
  createdAt: string;
}

interface UserIdentity {
  id: string;
  provider: 'EMAIL' | 'GOOGLE' | 'APPLE';
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
}
```

## Design Consistency

All screens follow the same design patterns:
- Card-based layout with `colors.card` background
- Border radius: `borderRadius['2xl']`
- Consistent spacing: `spacing[5]` for card padding
- Icon containers: 36x36 with `borderRadius.md`
- Section titles: Small, muted text above cards
- Dividers: 1px height, `colors.borderMuted`
- Theme-aware colors from `useTheme()`

## Files Created/Modified

### Created:
- `/mobile-apps/discover/src/screens/EditProfileScreen.tsx`
- `/mobile-apps/discover/src/screens/AccountSettingsScreen.tsx`
- `/mobile-apps/discover/app/edit-profile.tsx`
- `/mobile-apps/discover/docs/PROFILE_SCREENS_UPDATE.md`

### Modified:
- `/mobile-apps/discover/src/screens/UserProfileScreen.tsx`
  - Removed email and phone display (not in User type)
  - Updated Edit Profile button to navigate to `/edit-profile`
  - Fixed unused imports
- `/mobile-apps/discover/app/user-profile.tsx`
  - Changed title from "Edit Profile" to "Profile"
- `/mobile-apps/discover/app/account.tsx`
  - Changed from `NewAccountScreen` to `AccountSettingsScreen`
  - Updated title to "Account Settings"

## Testing Checklist

- [ ] User Profile screen displays correctly
- [ ] Edit Profile button navigates to Edit Profile screen
- [ ] Avatar upload works in Edit Profile
- [ ] All form fields save correctly in Edit Profile
- [ ] Username edit works in Account Settings
- [ ] Username availability check works
- [ ] Linked accounts display correctly
- [ ] Delete account confirmation shows
- [ ] All screens respect light/dark theme
- [ ] Navigation back buttons work correctly
- [ ] Loading states display properly
- [ ] Error messages show when needed

## Notes

- Delete account functionality is placeholder (shows "Coming Soon" alert)
- Stats (Events/Tickets/Coins) are hardcoded to 0 - need backend integration
- Tabs in User Profile are not functional yet - show empty state
- Phone number is display-only in Account Settings (no edit functionality)
