import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Sparkle } from '@unifesto/unicon/react-native';
import AuthField from './auth/AuthField';
import { CardBackdrop } from './ui/CardSurface';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { selectionTick } from '../lib/haptics';
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

/**
 * One attendee's name, email, mobile and gender on a cosmos card. Fields are
 * wired to the system's autofill so the first person fills in with a tap.
 */
export default function AttendeeForm({
  attendee,
  index,
  onChange,
  errors = {},
  showTitle = true,
  onFillFromProfile,
}: AttendeeFormProps) {
  const c = useCosmos();
  // Base options + a pre-selected chip for a prefilled value that isn't one of
  // them (e.g. a legacy free-text gender), so it never renders as "unfilled".
  const genderOptions: string[] = isCustomGender(attendee.gender)
    ? [...ATTENDEE_GENDER_OPTIONS, attendee.gender]
    : [...ATTENDEE_GENDER_OPTIONS];
  const fill = onFillFromProfile && index === 0;
  const set = (field: keyof AttendeeInfo) => (v: string) => onChange(index, field, v);

  return (
    <View style={styles.card}>
      <CardBackdrop shape={styles.card} />
      {showTitle || fill ? (
        <View style={styles.head}>
          {showTitle ? (
            <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
              {index === 0 ? 'My details' : `Attendee ${index + 1}`}
            </Text>
          ) : <View />}
          {fill ? (
            <Pressable
              onPress={onFillFromProfile}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [styles.fill, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Sparkle size={14} color={c.text} weight="fill" />
              <Text style={[styles.fillText, { color: c.text }]}>Fill from profile</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.fields}>
        <Field error={errors.name}>
          <AuthField
            label="Full name"
            value={attendee.name}
            onChangeText={set('name')}
            placeholder="As it should appear on the pass"
            autoCapitalize="words"
            textContentType={index === 0 ? 'name' : 'none'}
            autoComplete={index === 0 ? 'name' : 'off'}
            error={!!errors.name}
          />
        </Field>
        <Field error={errors.email}>
          <AuthField
            label="Email"
            value={attendee.email}
            onChangeText={set('email')}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={index === 0 ? 'emailAddress' : 'none'}
            autoComplete={index === 0 ? 'email' : 'off'}
            error={!!errors.email}
          />
        </Field>
        <Field error={errors.mobile}>
          <AuthField
            label="Mobile number"
            prefix="+91"
            value={attendee.mobile}
            onChangeText={(v) => onChange(index, 'mobile', v.replace(/\D/g, ''))}
            placeholder="10 digits"
            keyboardType="phone-pad"
            maxLength={10}
            textContentType={index === 0 ? 'telephoneNumber' : 'none'}
            autoComplete={index === 0 ? 'tel-national' : 'off'}
            error={!!errors.mobile}
          />
        </Field>
        <Field error={errors.gender}>
          <Text style={[styles.label, { color: c.muted }]}>Gender</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {genderOptions.map((option) => {
              const active = attendee.gender === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (!active) selectionTick();
                    onChange(index, 'gender', option);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? c.primary : c.tint, transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                >
                  {active ? <Check size={14} color={c.primaryFg} weight="bold" /> : null}
                  <Text style={[styles.chipText, { color: active ? c.primaryFg : c.text }]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
      </View>
    </View>
  );
}

function Field({ error, children }: { error?: string; children: React.ReactNode }) {
  const c = useCosmos();
  return (
    <View>
      {children}
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, padding: spacing[5], marginBottom: spacing[4] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] },
  title: { fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  fill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  fillText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  fields: { gap: spacing[5] },
  label: { fontSize: typography.fontSize.sm, marginBottom: 8, ...cosmosFont.strong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: spacing[4], borderRadius: 999 },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  error: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
