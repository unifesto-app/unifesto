import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'phosphor-react-native';
import { spacing, typography, borderRadius } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import { useTheme } from '../context/ThemeContext';

interface Step {
  id: string;
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  const { colors } = useTheme();
  
  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing[8],
      paddingHorizontal: spacing[2],
    },
    stepContainer: {
      flex: 1,
      alignItems: 'center',
    },
    stepCircleContainer: {
      position: 'relative',
      alignItems: 'center',
      width: '100%',
      marginBottom: spacing[2],
    },
    stepCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      zIndex: 2,
    },
    stepCircleCompleted: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    stepCircleCurrent: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    stepCircleUpcoming: {
      backgroundColor: colors.card,
      borderColor: colors.borderMuted,
    },
    stepNumber: {
      fontSize: typography.fontSize.sm,
      fontFamily: typography.fontFamily.bold,
    },
    stepNumberCurrent: {
      color: colors.background,
    },
    stepNumberUpcoming: {
      color: colors.textMuted,
    },
    connector: {
      position: 'absolute',
      top: 18,
      left: '50%',
      right: '-50%',
      height: 2,
      backgroundColor: colors.borderMuted,
      zIndex: 1,
    },
    connectorCompleted: {
      backgroundColor: colors.primary,
    },
    stepLabel: {
      fontSize: typography.fontSize.xs,
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
    },
    stepLabelCurrent: {
      color: colors.text,
      fontFamily: typography.fontFamily.bold,
    },
    stepLabelUpcoming: {
      color: colors.textMuted,
    },
  });

  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        const isUpcoming = stepNumber > currentStep;

        return (
          <View key={step.id} style={styles.stepContainer}>
            {/* Step Circle */}
            <View style={styles.stepCircleContainer}>
              <View
                style={[
                  styles.stepCircle,
                  isCompleted && styles.stepCircleCompleted,
                  isCurrent && styles.stepCircleCurrent,
                  isUpcoming && styles.stepCircleUpcoming,
                ]}
              >
                {isCompleted ? (
                  <Check size={16} color={colors.background}  weight="bold" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      isCurrent && styles.stepNumberCurrent,
                      isUpcoming && styles.stepNumberUpcoming,
                    ]}
                  >
                    {stepNumber}
                  </Text>
                )}
              </View>
              
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    isCompleted && styles.connectorCompleted,
                  ]}
                />
              )}
            </View>

            {/* Step Label */}
            <Text
              style={[
                styles.stepLabel,
                isCurrent && styles.stepLabelCurrent,
                isUpcoming && styles.stepLabelUpcoming,
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
