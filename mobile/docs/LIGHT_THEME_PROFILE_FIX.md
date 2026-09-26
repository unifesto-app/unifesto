# Light Theme Profile Screen Fix

## Issue
The Profile Screen and its components were not properly adapting to light theme, showing dark backgrounds and poor contrast in light mode.

## Root Cause
Several components used by the Profile Screen had hardcoded colors that didn't respond to theme changes:
1. **CustomHeader** - Black gradient background
2. **Footer** - Static text colors
3. **Skeleton** - Static background color

## Components Fixed

### 1. CustomHeader (`src/components/CustomHeader.tsx`)

**Changes:**
- Added `useTheme` hook to access dynamic colors and active theme
- Replaced hardcoded black gradient with dynamic gradient based on theme:
  - **Dark mode**: `['#000000', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0)']`
  - **Light mode**: `['#ffffff', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']`
- Bell icon now uses dynamic `colors.primary`

**Before:**
```typescript
import { spacing, colors } from '../theme';

// Hardcoded black gradient
<LinearGradient
  colors={['#000000', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0)']}
  ...
/>
```

**After:**
```typescript
import { spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';

const { colors, activeTheme } = useTheme();

const gradientColors: readonly [string, string, string] = activeTheme === 'light' 
  ? ['#ffffff', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']
  : ['#000000', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'];

<LinearGradient colors={gradientColors} ... />
```

### 2. Footer (`src/components/Footer.tsx`)

**Changes:**
- Added `useTheme` hook
- Moved StyleSheet inside component to access dynamic colors
- Footer version text now uses dynamic `colors.textMuted`

**Before:**
```typescript
import { colors, spacing, typography } from '../theme';

const styles = StyleSheet.create({
  footerVersion: {
    color: colors.textMuted, // Static
  },
});
```

**After:**
```typescript
import { spacing, typography } from '../theme';
import { useTheme } from '../context/ThemeContext';

const { colors } = useTheme();

const styles = StyleSheet.create({
  footerVersion: {
    color: colors.textMuted, // Dynamic
  },
});
```

### 3. Skeleton (`src/components/Skeleton.tsx`)

**Changes:**
- Added `useTheme` hook
- Removed static StyleSheet
- Applied dynamic `colors.borderMuted` directly to component style

**Before:**
```typescript
import { colors, borderRadius } from '../theme';

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.borderMuted, // Static
  },
});
```

**After:**
```typescript
import { borderRadius } from '../theme';
import { useTheme } from '../context/ThemeContext';

const { colors } = useTheme();

<Animated.View
  style={{
    backgroundColor: colors.borderMuted, // Dynamic
    ...
  }}
/>
```

## Visual Improvements

### Dark Mode (Before & After)
- ✅ No change - already working correctly

### Light Mode (Before & After)

**Before (Broken):**
- Black header gradient on white background (poor contrast)
- Dark skeleton loaders barely visible
- Footer text hard to read

**After (Fixed):**
- White header gradient blends smoothly with light background
- Skeleton loaders use appropriate light gray
- Footer text has proper contrast
- All cards and surfaces use light theme colors

## Testing Checklist

Test the Profile Screen in all three theme modes:

### Dark Mode
- ✅ Header gradient is black
- ✅ Text is white/light gray
- ✅ Cards have dark background
- ✅ Skeleton loaders are visible

### Light Mode
- ✅ Header gradient is white
- ✅ Text is black/dark gray
- ✅ Cards have white background
- ✅ Skeleton loaders are visible
- ✅ All text has sufficient contrast

### System Mode
- ✅ Follows device theme setting
- ✅ Switches correctly when device theme changes

## Related Components

These components are now theme-aware and will work correctly in any screen:
- `CustomHeader` - Used in Home, Discover, Wallet, Profile tabs
- `Footer` - Used in various screens
- `Skeleton` - Used for loading states throughout the app

## Next Steps

Other screens that use these components will automatically benefit from these fixes. However, screens themselves may still need updating if they have:
- Static color imports from `theme/colors.ts`
- Hardcoded color values
- StyleSheets defined outside the component

Refer to `LIGHT_MODE_IMPLEMENTATION.md` for the complete list of screens that need updating.

## Files Modified

1. `src/components/CustomHeader.tsx`
2. `src/components/Footer.tsx`
3. `src/components/Skeleton.tsx`

All changes are backward compatible and don't affect dark mode appearance.
