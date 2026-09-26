/**
 * Deep Linking Configuration
 * Handles URL parsing and slug-to-ID conversion for deep links
 */

import { LinkingOptions } from '@react-navigation/native';

// Standard linking configuration
// Slug-to-ID conversion is handled in AppNavigator.tsx
export const linking: LinkingOptions<any> = {
  prefixes: [
    'unifesto://',
    'https://unifesto.app',
    'https://www.unifesto.app',
  ],
  config: {
    screens: {
      // Auth screens
      Login: 'login',
      SignUp: 'signup',
      
      // Main app tabs
      MainApp: {
        screens: {
          Home: 'home',
          Discover: 'discover',
          Tickets: 'tickets',
          Profile: 'profile',
        },
      },
      
      // Event detail - expects eventId parameter
      EventDetail: {
        path: 'events/:eventId',
      },
      
      // Organization detail - expects organizationId parameter
      OrganizationDetail: {
        path: 'org/:organizationId',
      },
      
      // Other screens
      Events: 'events',
      OrganizationsList: 'organizations',
    },
  },
};
