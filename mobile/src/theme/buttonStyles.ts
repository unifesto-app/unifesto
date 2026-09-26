// Shared button styles for consistency across the app
import { StyleSheet } from 'react-native';
import { spacing, borderRadius } from './spacing';
import { typography } from './typography';

// Standard blue gradient colors
export const blueGradientColors = ['#3491ff', '#0062ff'];

// Standard gradient configuration
export const standardGradientConfig = {
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

// Common button styles
export const buttonStyles = StyleSheet.create({
  // Container for gradient button
  blueButtonContainer: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    backgroundColor: '#3491ff', // Fallback color for Android
  },
  
  // Gradient inner content
  blueButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    minHeight: 44,
    width: '100%',
  },
  
  // Text style for blue gradient buttons
  blueButtonText: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.primary,
    fontWeight: '400',
    color: '#000000',
    lineHeight: typography.fontSize.base * 1.5,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
