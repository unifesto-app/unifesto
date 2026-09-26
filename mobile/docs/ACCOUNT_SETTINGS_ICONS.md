# Account Settings Icons Update

## Overview
Updated Account Settings screen to use PNG icons instead of lucide-react-native icons for better visual consistency.

## Icons Used

### Account Information Section
1. **Username** - `at.png` (32x32)
   - Used for the username field
   - Shows @ symbol icon

2. **Phone Number** - `phone.png` (32x32)
   - Used for the phone number field
   - Shows phone icon

### Linked Accounts Section
Dynamic icons based on provider type:

1. **Google** - `google.png` (32x32)
   - Shows Google logo
   - Used when provider is 'GOOGLE'

2. **Apple** - `apple.png` (32x32)
   - Shows Apple logo
   - Used when provider is 'APPLE'

3. **Email** - `email.png` (32x32)
   - Shows email icon
   - Used when provider is 'EMAIL'

## Implementation Details

### Icon Mapping Function
```typescript
const getProviderIcon = (provider: string) => {
  switch (provider) {
    case 'GOOGLE':
      return require('../../assets/icons/google.png');
    case 'APPLE':
      return require('../../assets/icons/apple.png');
    case 'EMAIL':
      return require('../../assets/icons/email.png');
    default:
      return require('../../assets/icons/email.png');
  }
};
```

### Icon Styling
- **Size**: 32x32 pixels (display size)
- **Resize Mode**: `contain`
- **No background**: Icons display as-is without colored backgrounds
- **No tint**: Icons maintain their original colors

### Removed Icons
- Removed `User` icon from lucide-react-native (replaced with at.png)
- Removed `Phone` icon from lucide-react-native (replaced with phone.png)
- Removed `Link` icon from lucide-react-native (replaced with provider-specific icons)

### Kept Icons
- `ChevronRight` - Still using lucide-react-native for navigation arrows
- `Trash2` - Still using lucide-react-native for delete button

## File Locations

### Icon Assets
All icons are located in:
```
/mobile-apps/discover/assets/icons/
├── at.png (16 KB)
├── phone.png (16 KB)
├── google.png (20 KB)
├── apple.png (6.2 KB)
└── email.png (18 KB)
```

### Updated Screen
```
/mobile-apps/discover/src/screens/AccountSettingsScreen.tsx
```

## Visual Consistency

The icons now match the style used in the Profile screen:
- Same size (32x32)
- Same display approach (no backgrounds, no tints)
- Consistent with other PNG icons in the app

## Benefits

1. **Visual Consistency** - All icons follow the same pattern
2. **Brand Recognition** - Provider logos are instantly recognizable
3. **Better UX** - Clear visual distinction between different account types
4. **Performance** - PNG icons load faster than SVG-based lucide icons
5. **Customization** - Easy to update icons without code changes
