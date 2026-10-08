import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Envelope, Phone, User } from '@unifesto/unicon/react-native';
import { spacing, typography, borderRadius } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import { useTheme } from '../context/ThemeContext';
import { ATTENDEE_GENDER_OPTIONS, isCustomGender } from '../utils/profile';

interface AttendeeInfo {
  name: string;
  email: string;
  mobile: string;
  gender: string;
}

interface AttendeeFormProps {
  attendee: AttendeeInfo;
  index: number;
  onChange: (index: number, field: keyof AttendeeInfo, value: string) => void;
  errors?: Partial<Record<keyof AttendeeInfo, string>>;
  showTitle?: boolean;
  onFillFromProfile?: () => void;
}

export default function AttendeeForm({
  attendee,
  index,
  onChange,
  errors = {},
  showTitle = true,
  onFillFromProfile,
}: AttendeeFormProps) {
  const { colors, tokens } = useTheme();
  // Base options + a pre-selected chip for a prefilled value that isn't one of
  // them (e.g. a legacy free-text gender), so it never renders as "unfilled".
  const genderOptions: string[] = isCustomGender(attendee.gender)
    ? [...ATTENDEE_GENDER_OPTIONS, attendee.gender]
    : [...ATTENDEE_GENDER_OPTIONS];

  const styles = StyleSheet.create({
    // Borderless card on the elevated surface (matches the rest of the app).
    container: {
      backgroundColor: tokens.elevated,
      borderRadius: borderRadius.xl,
      padding: spacing[5],
      marginBottom: spacing[4],
    },
    formTitle: {
      fontSize: typography.fontSize.lg,
      fontFamily: getFontFamily('bold'),
      color: colors.text,
    },
    inputGroup: {
      marginBottom: spacing[5],
    },
    label: {
      fontSize: typography.fontSize.sm,
      fontFamily: getFontFamily('bold'),
      color: colors.text,
      marginBottom: spacing[2],
    },
    required: {
      color: '#ef4444',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: tokens.fill,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderWidth: 1,
      // Outline only appears for errors; otherwise the field is fill-only.
      borderColor: 'transparent',
      gap: spacing[3],
    },
    inputError: {
      borderColor: '#ef4444',
    },
    countryCode: {
      fontSize: typography.fontSize.base,
      color: colors.text,
      fontFamily: getFontFamily('bold'),
      paddingRight: spacing[2],
      borderRightWidth: 1,
      borderRightColor: colors.borderMuted,
    },
    input: {
      flex: 1,
      fontSize: typography.fontSize.base,
      color: colors.text,
      fontFamily: typography.fontFamily.primary,
    },
    errorText: {
      fontSize: typography.fontSize.xs,
      color: '#ef4444',
      marginTop: spacing[1],
      marginLeft: spacing[1],
    },
    genderContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing[2],
    },
    genderOption: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
      borderRadius: borderRadius.full,
      backgroundColor: tokens.fill,
    },
    genderOptionSelected: {
      backgroundColor: colors.text,
    },
    genderOptionText: {
      fontSize: typography.fontSize.sm,
      color: colors.textSecondary,
      fontFamily: getFontFamily('bold'),
    },
    genderOptionTextSelected: {
      color: colors.background,
      fontFamily: getFontFamily('bold'),
    },
  });

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: showTitle || (onFillFromProfile && index === 0) ? spacing[5] : 0 }}>
        {showTitle && (
          <Text style={styles.formTitle}>
            {index === 0 ? 'My details' : `Attendee ${index + 1}`}
          </Text>
        )}
        {onFillFromProfile && index === 0 && (
          <TouchableOpacity 
            onPress={onFillFromProfile} 
            style={{ 
              paddingVertical: 6, 
              paddingHorizontal: 12, 
              backgroundColor: 'rgba(52,145,255,0.12)', 
              borderRadius: 20,
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: getFontFamily('semibold') }}>✦ Fill from profile</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Name */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Full name <Text style={styles.required}>*</Text>
        </Text>
        <View style={[styles.inputContainer, errors.name && styles.inputError]}>
          <User size={18} color={colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Enter full name"
            placeholderTextColor={colors.textMuted}
            value={attendee.name}
            onChangeText={(value) => onChange(index, 'name', value)}
            autoCapitalize="words"
          />
        </View>
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
      </View>

      {/* Email */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Email address <Text style={styles.required}>*</Text>
        </Text>
        <View style={[styles.inputContainer, errors.email && styles.inputError]}>
          <Envelope size={18} color={colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Enter email address"
            placeholderTextColor={colors.textMuted}
            value={attendee.email}
            onChangeText={(value) => onChange(index, 'email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
      </View>

      {/* Mobile */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Mobile number <Text style={styles.required}>*</Text>
        </Text>
        <View style={[styles.inputContainer, errors.mobile && styles.inputError]}>
          <Phone size={18} color={colors.textMuted} />
          <Text style={styles.countryCode}>+91</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter mobile number"
            placeholderTextColor={colors.textMuted}
            value={attendee.mobile}
            onChangeText={(value) => {
              // Remove any non-digit characters
              const cleaned = value.replace(/\D/g, '');
              onChange(index, 'mobile', cleaned);
            }}
            keyboardType="phone-pad"
            maxLength={10}
          />
        </View>
        {errors.mobile && <Text style={styles.errorText}>{errors.mobile}</Text>}
      </View>

      {/* Gender */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Gender <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.genderContainer}>
          {genderOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.genderOption,
                attendee.gender === option && styles.genderOptionSelected,
              ]}
              onPress={() => onChange(index, 'gender', option)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.genderOptionText,
                  attendee.gender === option && styles.genderOptionTextSelected,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.gender && <Text style={styles.errorText}>{errors.gender}</Text>}
      </View>
    </View>
  );
}
