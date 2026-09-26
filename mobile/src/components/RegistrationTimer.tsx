import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'phosphor-react-native';
import { spacing, typography, borderRadius } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import { useTheme } from '../context/ThemeContext';

interface RegistrationTimerProps {
  initialSeconds: number;
  onExpire: () => void;
}

export default function RegistrationTimer({ initialSeconds, onExpire }: RegistrationTimerProps) {
  const { colors } = useTheme();
  
  const styles = StyleSheet.create({
    container: {
      marginBottom: spacing[6],
    },
    timerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing[4],
      borderWidth: 1,
      borderColor: colors.borderMuted,
      gap: spacing[3],
    },
    expiredCard: {
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    timerContent: {
      flex: 1,
    },
    timerText: {
      fontSize: typography.fontSize.xl,
      fontFamily: getFontFamily('bold'),
      marginBottom: spacing[1],
    },
    timerLabel: {
      fontSize: typography.fontSize.xs,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: typography.letterSpacing.wider,
    },
    expiredText: {
      fontSize: typography.fontSize.base,
      fontFamily: getFontFamily('bold'),
      color: '#ef4444',
    },
    progressBar: {
      height: 4,
      backgroundColor: colors.borderLight,
      borderRadius: borderRadius.full,
      marginTop: spacing[3],
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: borderRadius.full,
    },
    warningText: {
      fontSize: typography.fontSize.xs,
      color: '#ef4444',
      textAlign: 'center',
      marginTop: spacing[2],
      fontFamily: getFontFamily('bold'),
    },
  });

  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      onExpire();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onExpire]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerColor = () => {
    if (timeLeft <= 60) return '#ef4444'; // Red for last minute
    if (timeLeft <= 300) return '#f59e0b'; // Orange for last 5 minutes
    return colors.primary; // Blue for normal
  };

  const getProgressPercentage = () => {
    return (timeLeft / initialSeconds) * 100;
  };

  if (isExpired) {
    return (
      <View style={styles.container}>
        <View style={[styles.timerCard, styles.expiredCard]}>
          <Clock size={16} color="#ef4444" />
          <Text style={styles.expiredText}>Time Expired</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.timerCard}>
        <Clock size={16} color={getTimerColor()} />
        <View style={styles.timerContent}>
          <Text style={[styles.timerText, { color: getTimerColor() }]}>
            {formatTime(timeLeft)}
          </Text>
          <Text style={styles.timerLabel}>Time Remaining</Text>
        </View>
      </View>
      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill, 
            { 
              width: `${getProgressPercentage()}%`,
              backgroundColor: getTimerColor()
            }
          ]} 
        />
      </View>
      {timeLeft <= 60 && (
        <Text style={styles.warningText}>⚠️ Hurry! Registration will expire soon</Text>
      )}
    </View>
  );
}
