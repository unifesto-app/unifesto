import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { addBankAccount, type NewBankAccount } from '../lib/api/finance';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const TYPES = [
  { key: 'savings' as const, label: 'Savings' },
  { key: 'current' as const, label: 'Current' },
];

const EMPTY: NewBankAccount = {
  accountHolderName: '',
  mobileNumber: '',
  accountNumber: '',
  ifscCode: '',
  bankName: '',
  accountType: 'savings',
  isPrimary: false,
};

/**
 * Add a bank account for payouts. It starts as "being verified" and can only
 * receive money once Unifesto verifies it. The account number is typed twice,
 * since a typo here sends real money to the wrong place.
 */
export default function AddPayoutAccountScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [form, setForm] = useState<NewBankAccount>(EMPTY);
  const [confirmNumber, setConfirmNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<NewBankAccount>) => {
    setError('');
    setForm((f) => ({ ...f, ...patch }));
  };

  const validate = () => {
    if (!form.accountHolderName.trim()) return "Enter the account holder's name.";
    if (form.mobileNumber.replace(/\D/g, '').length < 10) return 'Enter the mobile number linked to the account.';
    if (!form.bankName.trim()) return 'Enter the bank name.';
    if (!/^\d{9,18}$/.test(form.accountNumber)) return 'Account numbers are 9 to 18 digits.';
    if (form.accountNumber !== confirmNumber) return "The account numbers don't match.";
    if (!IFSC.test(form.ifscCode)) return 'IFSC codes look like HDFC0001234.';
    return '';
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    const res = await addBankAccount({
      ...form,
      accountHolderName: form.accountHolderName.trim(),
      mobileNumber: form.mobileNumber.trim(),
      bankName: form.bankName.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: tokens.textSecondary }]}>
          Payouts go here once Unifesto verifies the account. You can keep several and choose per event.
        </Text>

        <SettingsGroup title="Account holder" plain>
          <FieldRow stacked label="Name on the account" value={form.accountHolderName} onChangeText={(v) => set({ accountHolderName: v })} autoCapitalize="words" />
          <FieldRow stacked label="Linked mobile number" value={form.mobileNumber} onChangeText={(v) => set({ mobileNumber: v })} keyboardType="phone-pad" />
        </SettingsGroup>

        <SettingsGroup title="Bank" plain>
          <FieldRow stacked label="Bank name" value={form.bankName} onChangeText={(v) => set({ bankName: v })} placeholder="HDFC Bank" />
          <FieldRow
            stacked
            label="Account number"
            value={form.accountNumber}
            onChangeText={(v) => set({ accountNumber: v.replace(/\D/g, '') })}
            keyboardType="number-pad"
            secureTextEntry
          />
          <FieldRow
            stacked
            label="Account number again"
            value={confirmNumber}
            onChangeText={(v) => {
              setError('');
              setConfirmNumber(v.replace(/\D/g, ''));
            }}
            keyboardType="number-pad"
          />
          <FieldRow
            stacked
            label="IFSC code"
            value={form.ifscCode}
            onChangeText={(v) => set({ ifscCode: v.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
            placeholder="HDFC0001234"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={11}
          />
        </SettingsGroup>

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Account type</BlockTitle>
          <SegmentedTabs tabs={TYPES} value={form.accountType} onChange={(t) => set({ accountType: t })} />
        </View>

        <SettingsGroup plain>
          <SwitchRow
            label="Make this my primary account"
            hint="Used for any event that doesn't pick an account."
            value={form.isPrimary}
            onValueChange={(v) => set({ isPrimary: v })}
          />
        </SettingsGroup>
      </ScrollView>

      <SaveBar visible label="Add account" onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  intro: { marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
