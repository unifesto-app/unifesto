import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Application from 'expo-application';
import UnifestoAppWordmark from './UnifestoAppWordmark';
import { spacing, typography } from '../theme';
import { useTheme } from '../context/ThemeContext';

export default function Footer() {
  const { colors } = useTheme();

  const appVersion = Application.nativeApplicationVersion ?? '';

  const styles = StyleSheet.create({
    footerContainer: {
      marginTop: spacing[8],
    },
    dividerContainer: {
      alignItems: 'center',
      paddingHorizontal: spacing[6],
      marginBottom: spacing[12],
    },
    divider: {
      width: '66%',
      height: 1,
    },
    footer: {
      paddingHorizontal: spacing[6],
      paddingBottom: spacing[16],
      alignItems: 'center',
    },
    footerVersion: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      fontFamily: typography.fontFamily.primary,
      textAlign: 'center',
    },
  });

  return (
    <View style={styles.footerContainer}>
      {/* Gradient Divider */}
      <View style={styles.dividerContainer}>
        <LinearGradient
          colors={['transparent', colors.primary, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.divider}
        />
      </View>

      <View style={styles.footer}>
        <UnifestoAppWordmark width={150} height={50} />
        {/* Check for updates now lives in Profile → Resources. */}
        <Text style={styles.footerVersion}>Version {appVersion}</Text>
      </View>
    </View>
  );
}
