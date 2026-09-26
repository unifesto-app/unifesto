import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
} from 'react-native';
import { spacing, borderRadius, typography } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import { useTheme } from '../context/ThemeContext';

interface PasscodeInputProps {
  length: number; // 4-6 digits
  onComplete: (passcode: string) => void;
  onChangeText?: (passcode: string) => void;
  secureTextEntry?: boolean;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  value?: string; // Controlled value
}

export default function PasscodeInput({
  length,
  onComplete,
  onChangeText,
  secureTextEntry = true,
  error = false,
  disabled = false,
  autoFocus = true,
  value,
}: PasscodeInputProps) {
  const { colors } = useTheme();
  
  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
    },
    boxesContainer: {
      flexDirection: 'row',
      gap: spacing[3],
      justifyContent: 'center',
    },
    box: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.lg,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxFilled: {
      borderColor: colors.primary,
      backgroundColor: 'rgba(52, 145, 255, 0.05)',
    },
    boxActive: {
      borderColor: colors.primary,
      backgroundColor: 'rgba(52, 145, 255, 0.1)',
    },
    boxError: {
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239, 68, 68, 0.05)',
    },
    boxDisabled: {
      opacity: 0.5,
    },
    boxText: {
      fontSize: typography.fontSize['2xl'],
      fontFamily: getFontFamily('bold'),
      color: colors.textMuted,
    },
    boxTextFilled: {
      color: colors.text,
    },
    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1,
    },
  });

  const [passcode, setPasscode] = useState(value || '');
  const inputRef = useRef<TextInput>(null);

  // Sync with controlled value prop
  useEffect(() => {
    if (value !== undefined) {
      setPasscode(value);
    }
  }, [value]);

  // Reset passcode when component mounts or length changes
  useEffect(() => {
    if (value === undefined) {
      setPasscode('');
      // Also clear the TextInput value
      if (inputRef.current) {
        inputRef.current.clear();
      }
    }
  }, [length, value]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Small delay to ensure keyboard shows
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [autoFocus]);

  const handleChangeText = (text: string) => {
    // Only allow digits
    const digits = text.replace(/[^0-9]/g, '');
    const truncated = digits.slice(0, length);
    
    setPasscode(truncated);
    onChangeText?.(truncated);

    // Call onComplete when length is reached
    if (truncated.length === length) {
      onComplete(truncated);
    }
  };

  const handleBoxPress = () => {
    inputRef.current?.focus();
  };

  const renderBoxes = () => {
    const boxes = [];
    for (let i = 0; i < length; i++) {
      const isFilled = i < passcode.length;
      const isActive = i === passcode.length;
      
      boxes.push(
        <TouchableOpacity
          key={i}
          style={[
            styles.box,
            isFilled && styles.boxFilled,
            isActive && styles.boxActive,
            error && styles.boxError,
            disabled && styles.boxDisabled,
          ]}
          onPress={handleBoxPress}
          activeOpacity={0.7}
          disabled={disabled}
        >
          <Text style={[styles.boxText, isFilled && styles.boxTextFilled]}>
            {isFilled ? (secureTextEntry ? '●' : passcode[i]) : ''}
          </Text>
        </TouchableOpacity>
      );
    }
    return boxes;
  };

  return (
    <View style={styles.container}>
      <View style={styles.boxesContainer}>{renderBoxes()}</View>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={passcode}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        maxLength={length}
        secureTextEntry={false} // We handle masking in the UI
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
      />
    </View>
  );
}
