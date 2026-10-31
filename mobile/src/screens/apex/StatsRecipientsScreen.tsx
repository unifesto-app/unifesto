import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Phone, PlusCircle, WhatsappLogo, X } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import FormRow from '../../components/profile/FormRow';
import { Button } from '../../components/ui';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../components/ui/CardSurface';
import SaveBar from '../../components/manage/SaveBar';
import { GUTTER } from '../../components/home/Section';
import { getStatsRecipients, updateStatsRecipients } from '../../lib/api/apex';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

/*
 * Apex "Stats recipients": the WhatsApp numbers that get the Unifesto Stats
 * daily snapshot, weekly digest and milestone messages. Edit the list locally,
 * then one Save replaces it on the server (which re-normalises to E.164).
 */

const ICON = 24;

/** Same rule as the server: bare 10 digits = India, else 11–15 digits with country code. */
function normalize(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "+919848945690" → "+91 98489 45690"; other country codes are left as stored. */
function display(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((n, i) => n === b[i]);

export default function StatsRecipientsScreen() {
  const c = useCosmos();

  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [input, setInput] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await getStatsRecipients();
    if (!res.ok) {
      setLoadError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
      return;
    }
    setSaved(res.data.numbers);
    setDraft(res.data.numbers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = !!saved && !!draft && !sameList(saved, draft);

  const add = () => {
    if (!input.trim()) return;
    const e164 = normalize(input);
    if (!e164) {
      setError('Enter a 10-digit Indian number, or a full number with country code.');
      return;
    }
    if (draft?.includes(e164)) {
      setError(`${display(e164)} is already on the list.`);
      return;
    }
    setDraft((d) => (d ? [...d, e164] : d));
    setInput('');
    setError('');
    setNotice('');
  };

  const remove = (n: string) => {
    setDraft((d) => (d ? d.filter((x) => x !== n) : d));
    setError('');
    setNotice('');
  };

  const save = async () => {
    if (!isDirty || saving || !draft) return;
    setSaving(true);
    setError('');
    const res = await updateStatsRecipients(draft);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(res.data.numbers);
    setDraft(res.data.numbers);
    setNotice('Saved. The next stats message goes to this list.');
  };

  if (!draft) {
    return (
      <CosmosScreen contentContainerStyle={styles.pad}>
        {loadError ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.muted, { color: c.soft }]}>{loadError}</Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      keyboard
      bottom={180}
      contentContainerStyle={styles.pad}
      keyboardDismissMode="interactive"
      footer={<SaveBar visible={isDirty} label="Save changes" onPress={save} loading={saving} />}
    >
        <SettingsGroup title="Recipients">
          {draft.length === 0 ? (
            <SettingsRow label="No one yet" value="Stats won't be sent" />
          ) : (
            draft.map((n) => (
              <SettingsRow
                key={n}
                icon={<WhatsappLogo size={ICON} color={c.text} />}
                label={display(n)}
                trailing={
                  <Pressable onPress={() => remove(n)} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Remove ${display(n)}`}>
                    <X size={18} color={c.muted} weight="bold" />
                  </Pressable>
                }
              />
            ))
          )}
        </SettingsGroup>

        <SettingsGroup title="Add a number">
          <FormRow
            icon={<Phone size={ICON} color={c.text} />}
            value={input}
            onChangeText={(v) => {
              setInput(v);
              setError('');
            }}
            placeholder="98489 45690"
            keyboardType="phone-pad"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={add}
            trailing={
              <Pressable onPress={add} hitSlop={12} disabled={!input.trim()} accessibilityRole="button" accessibilityLabel="Add number">
                <PlusCircle size={26} color={input.trim() ? c.text : c.muted} weight="fill" />
              </Pressable>
            }
          />
        </SettingsGroup>

        <Text style={[styles.note, { color: c.muted }]}>
          These numbers get the Unifesto Stats WhatsApp: a daily snapshot at 8 AM, a weekly digest on Mondays at 9 AM, and
          milestone alerts. A 10-digit number is treated as Indian (+91).
        </Text>

        {error ? <Text style={[styles.message, { color: c.danger }]}>{error}</Text> : null}
        {notice && !isDirty ? <Text style={[styles.message, { color: c.success }]}>{notice}</Text> : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  note: { marginTop: spacing[4], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
  message: { marginTop: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
