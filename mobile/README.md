# Unifesto Mobile App

React Native mobile application for Unifesto - A standalone UI showcase with mock data.

## Features

- 📱 **Cross-platform**: Works on iOS, Android, and Web
- 🎨 **Modern UI**: Clean, responsive design with Lucide icons
- 📅 **Events**: Browse and view event details
- 🏢 **Organizations**: Explore organizations
- 💼 **Careers**: Find job opportunities
- 👤 **Profile**: View user profile
- 🚀 **No Backend Required**: Uses mock data for demonstration

## Tech Stack

- **React Native** with Expo
- **TypeScript** for type safety
- **React Navigation** for routing
- **Lucide React Native** for icons
- **Mock Data** for content

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- iOS Simulator (for Mac) or Android Studio (for Android development)

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Start the app:**
```bash
npm start
```

3. **Choose your platform:**
   - Press `i` for iOS Simulator
   - Press `a` for Android Emulator
   - Press `w` for Web browser
   - Scan QR code with Expo Go app on your physical device

## Project Structure

```
mobile-app/
├── src/
│   ├── navigation/       # Navigation setup
│   │   └── AppNavigator.tsx
│   ├── screens/          # Screen components
│   │   ├── HomeScreen.tsx
│   │   ├── EventsScreen.tsx
│   │   ├── EventDetailScreen.tsx
│   │   ├── OrganizationsScreen.tsx
│   │   ├── CareersScreen.tsx
│   │   └── ProfileScreen.tsx
│   └── types/            # TypeScript type definitions
│       └── index.ts
├── App.tsx               # Root component
├── package.json
└── README.md
```

## Screens

### Home Screen
- Welcome message
- Feature cards for quick navigation
- About section

### Events Screen
- List of events with images
- Event details (date, location, status)
- Tap to view full details

### Event Detail Screen
- Full event information
- Large hero image
- Registration button

### Organizations Screen
- List of organizations
- Logos and descriptions
- Website links

### Careers Screen
- Job listings
- Job type badges (full-time, part-time, contract, internship)
- Salary information
- Status indicators

### Profile Screen
- User information
- Contact details
- Settings access

## Mock Data

The app uses mock data for demonstration purposes. Data is defined directly in each screen component:

- **Events**: 4 sample events with various statuses
- **Organizations**: 4 sample organizations
- **Careers**: 4 sample job listings
- **Profile**: Sample user data

## Customization

### Adding More Mock Data

Edit the `MOCK_*` constants in each screen file:

```typescript
// In EventsScreen.tsx
const MOCK_EVENTS = [
  {
    id: '1',
    title: 'Your Event',
    description: 'Event description',
    // ... more fields
  },
];
```

### Changing Colors

Main colors are defined in StyleSheet of each component:
- Primary: `#3B82F6` (blue)
- Success: `#10B981` (green)
- Warning: `#F59E0B` (orange)
- Error: `#EF4444` (red)

## Development

### Running the App

```bash
# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

### Type Checking

```bash
npm run type-check
```

## Building for Production

### Using EAS Build (Recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

## Troubleshooting

### Metro Bundler Issues
```bash
npm start -- --reset-cache
```

### iOS Simulator Issues
```bash
npx expo start --ios --clear
```

### Android Emulator Issues
```bash
npx expo start --android --clear
```

### Clear Everything
```bash
rm -rf node_modules
npm install
npm start -- --clear
```

## Features in Detail

### Navigation
- Bottom tab navigation with 5 tabs
- Stack navigation for detail screens
- Smooth transitions and animations

### UI Components
- Custom cards with shadows
- Status badges with colors
- Icon integration throughout
- Responsive layouts

### Performance
- FlatList for efficient list rendering
- Image lazy loading
- Optimized re-renders

## Future Enhancements

### Potential Features
- [ ] Search and filters
- [ ] Favorites/bookmarks
- [ ] Social sharing
- [ ] Calendar integration
- [ ] Map integration
- [ ] Dark mode
- [ ] Internationalization
- [ ] Backend API integration
- [ ] User authentication
- [ ] Push notifications

## Contributing

1. Create a feature branch
2. Make your changes
3. Test on both iOS and Android
4. Submit a pull request

## License

Private - Unifesto Project

## Support

For issues and questions, please contact the development team.

---

**Built with React Native and Expo** 🚀
# mobile
