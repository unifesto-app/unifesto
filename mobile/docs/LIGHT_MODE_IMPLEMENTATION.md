# Light Mode Implementation Guide

## Overview
Light mode has been partially implemented in the Unifesto Discover app. The theme infrastructure is complete and functional, but individual screens need to be updated to use dynamic colors from the ThemeContext.

## Current Status

### ✅ Completed
1. **ThemeContext** (`src/context/ThemeContext.tsx`)
   - Created with light and dark color schemes
   - Supports 'light', 'dark', and 'system' theme modes
   - Theme preference saved to AsyncStorage
   - Provides `useTheme()` hook for accessing colors

2. **Root Layout** (`app/_layout.tsx`)
   - Wrapped with ThemeProvider
   - Stack background color now uses dynamic colors

3. **AppearanceScreen** (`src/screens/AppearanceScreen.tsx`)
   - Fully functional theme switcher
   - All three theme options working (Dark, Light, System Default)
   - Uses dynamic colors from ThemeContext

### ⚠️ Partially Complete
Most screens still import and use static colors from `src/theme/colors.ts` instead of dynamic colors from ThemeContext.

## How to Update a Screen

### Step 1: Update Imports
**Before:**
```typescript
import { colors, spacing, typography, borderRadius, shadows } from '../theme';
```

**After:**
```typescript
import { spacing, typography, borderRadius, shadows } from '../theme';
import { useTheme } from '../context/ThemeContext';
```

### Step 2: Get Colors from Hook
Add this at the top of your component function:
```typescript
export default function MyScreen() {
  const { colors } = useTheme();
  // ... rest of component
}
```

### Step 3: Move StyleSheet Inside Component
**Before:**
```typescript
export default function MyScreen() {
  return <View style={styles.container}>...</View>;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background, // Static color
  },
});
```

**After:**
```typescript
export default function MyScreen() {
  const { colors } = useTheme();
  
  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.background, // Dynamic color
    },
  });
  
  return <View style={styles.container}>...</View>;
}
```

### Step 4: Update Icon Colors
Icons that use colors should also use the dynamic colors:
```typescript
<Calendar size={12} color={colors.primary} strokeWidth={2} />
```

## Screens That Need Updating

### High Priority (Main User-Facing Screens)
- [ ] `app/(tabs)/home.tsx` - Home screen
- [ ] `src/screens/DiscoverScreen.tsx` - Discover tab
- [ ] `src/screens/WalletScreen.tsx` - Wallet tab  
- [ ] `src/screens/ProfileScreen.tsx` - Profile tab
- [ ] `src/screens/SettingsScreen.tsx` - Settings screen

### Medium Priority (Secondary Screens)
- [ ] `src/screens/EventDetailScreen.tsx`
- [ ] `src/screens/EventsScreen.tsx`
- [ ] `src/screens/TicketsScreen.tsx`
- [ ] `src/screens/TicketDetailScreen.tsx`
- [ ] `src/screens/SpacesListScreen.tsx`
- [ ] `src/screens/OrganizationDetailScreen.tsx`
- [ ] `src/screens/NotificationsScreen.tsx`
- [ ] `src/screens/ReferralsScreen.tsx`

### Low Priority (Utility/Settings Screens)
- [ ] `src/screens/PreferencesScreen.tsx`
- [ ] `src/screens/NotificationSettingsScreen.tsx`
- [ ] `src/screens/PermissionsScreen.tsx`
- [ ] `src/screens/LegalScreen.tsx`
- [ ] `src/screens/LoginScreen.tsx`
- [ ] `src/screens/SignUpScreen.tsx`

### Components
- [ ] `src/components/CustomFieldInput.tsx`
- [ ] `src/components/CustomHeader.tsx` (if using static colors)
- [ ] Other components as needed

## Color Scheme Reference

### Dark Mode Colors
```typescript
{
  background: '#000000',
  backgroundSecondary: '#0a0a0a',
  text: '#ffffff',
  textMuted: '#94a3b8',
  textSecondary: '#64748b',
  card: '#0a0a0a',
  border: 'rgba(52, 145, 255, 0.3)',
  borderLight: 'rgba(255, 255, 255, 0.1)',
  borderMuted: 'rgba(255, 255, 255, 0.05)',
  // ... (see ThemeContext for full list)
}
```

### Light Mode Colors
```typescript
{
  background: '#ffffff',
  backgroundSecondary: '#f8f9fa',
  text: '#000000',
  textMuted: '#64748b',
  textSecondary: '#94a3b8',
  card: '#ffffff',
  border: 'rgba(52, 145, 255, 0.3)',
  borderLight: 'rgba(0, 0, 0, 0.1)',
  borderMuted: 'rgba(0, 0, 0, 0.05)',
  // ... (see ThemeContext for full list)
}
```

## Testing Checklist

After updating a screen, test:
1. ✅ Dark mode displays correctly
2. ✅ Light mode displays correctly
3. ✅ System default follows device settings
4. ✅ Theme switching works without app restart
5. ✅ All text is readable in both modes
6. ✅ Icons have appropriate colors
7. ✅ Cards and borders are visible
8. ✅ No hardcoded colors remain

## Notes

- Brand colors (primary, gradients) remain the same in both themes
- Only background, text, and surface colors change
- Ensure sufficient contrast in light mode for accessibility
- Test on both iOS and Android
- Consider edge cases like modals, overlays, and loading states

## Next Steps

1. Update high-priority screens first (Home, Discover, Wallet, Profile)
2. Test thoroughly in both light and dark modes
3. Update medium-priority screens
4. Update components that use static colors
5. Final testing pass across all screens
