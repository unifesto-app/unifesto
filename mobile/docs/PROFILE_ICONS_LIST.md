# Profile Screen Icons - PNG Files Needed

All icons should be placed in: `mobile-apps/discover/assets/icons/`

## Required PNG Files (32x32 size recommended)

1. **wallet.png** - Wallet icon (green themed)
2. **referral.png** - Referral/Gift icon (amber themed)
3. **notification.png** - ✅ Already exists
4. **permission.png** - ✅ Already exists
5. **appearance.png** - Appearance/Theme icon (pink themed)
6. **support.png** - Support/Help icon (blue themed)
7. **rate.png** - Star/Rating icon (amber themed)
8. **instagram.png** - Instagram icon (pink themed)
9. **signout.png** - Sign out/Logout icon (red themed)

## Icon Design Guidelines

- **Size**: 32x32 pixels (or higher resolution for retina displays)
- **Format**: PNG with transparency
- **Style**: Should match the existing notification.png and permission.png style
- **Colors**: Icons should include their own colors (no tint will be applied)

## Color Themes Reference

For consistency with the previous design:
- Wallet: Green (#10b981)
- Referral/Rate: Amber (#f59e0b)
- Notification: Purple (#8b5cf6)
- Permissions/Support: Blue (#3491ff)
- Appearance/Instagram: Pink (#ec4899)
- Sign Out: Red (#ef4444)

## Implementation Status

✅ **notification.png** - Implemented  
✅ **permission.png** - Implemented  
⏳ **wallet.png** - Pending  
⏳ **referral.png** - Pending  
⏳ **appearance.png** - Pending  
⏳ **support.png** - Pending  
⏳ **rate.png** - Pending  
⏳ **instagram.png** - Pending  
⏳ **signout.png** - Pending  

## File Paths in Code

```typescript
require('../../assets/icons/wallet.png')
require('../../assets/icons/referral.png')
require('../../assets/icons/notification.png')
require('../../assets/icons/permission.png')
require('../../assets/icons/appearance.png')
require('../../assets/icons/support.png')
require('../../assets/icons/rate.png')
require('../../assets/icons/instagram.png')
require('../../assets/icons/signout.png')
```

## Notes

- All icons are displayed at 32x32 size in the UI
- No background colors or tint colors are applied
- Icons should be designed with their final colors included
- Transparency is supported for non-rectangular icons
