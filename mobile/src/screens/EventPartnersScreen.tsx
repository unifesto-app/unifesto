import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Handshake } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { createPartnerLink, getPartnerLinks, revokePartnerLink, type PartnerLink } from '../lib/api/tracking';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { FieldRow } from '../components/manage/FormFields';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { shareLink } from '../lib/share';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;

/**
 * Partners for one event (curators): a club, community or sponsor gets its own
 * tracking link, and its contact sees the registrations it brings in under
 * Profile › Partner stats. Contacts only ever see counts, never attendees.
 */
export default function EventPartnersScreen() {
  const { eventId, title } = useLocalSearchParams<{ eventId: string; title?: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [partners, setPartners] = useState<PartnerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getPartnerLinks(eventId);
    if (res.ok) {
      setPartners(res.data);
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const share = (url: string) => void shareLink({ message: title || 'Register on Unifesto', url, title });

  const addPartner = async () => {
    if (!name.trim() || !email.trim()) {
      setFormError('Enter the partner name and their contact’s email.');
      return;
    }
    setSaving(true);
    setFormError('');
    const res = await createPartnerLink(eventId!, name.trim(), email.trim());
    setSaving(false);
    if (!res.ok) {
      setFormError(res.message);
      return;
    }
    setName('');
    setEmail('');
    setAdding(false);
    await load();
    AppAlert.alert(
      `${res.data.name} added`,
      'Share their tracking link with them. Their contact sees the registrations it brings in under Profile › Partner stats.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Share link', onPress: () => share(res.data.trackingUrl) },
      ],
    );
  };

  const partnerActions = (p: PartnerLink) =>
    AppAlert.alert(p.name, `${p.registrations} registration${p.registrations === 1 ? '' : 's'} so far.`, [
      {
        text: 'Copy tracking link',
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(p.trackingUrl);
            AppAlert.alert('Link copied', `Registrations through it count for ${p.name}.`);
          } catch {
            AppAlert.alert('Unable to copy', 'Please try again.');
          }
        },
      },
      { text: 'Share tracking link', onPress: () => share(p.trackingUrl) },
      {
        text: 'Remove partner',
        style: 'destructive',
        onPress: () =>
          AppAlert.alert(`Remove ${p.name}?`, 'They stop seeing the stats. Registrations already credited to them stay in Tracking.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                const res = await revokePartnerLink(eventId!, p.id);
                if (!res.ok) AppAlert.alert('Could not remove', res.message);
                await load();
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const icon = <Handshake size={ICON} color={tokens.text} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={tokens.accent}
          />
        }
      >
        {title ? <Text style={[styles.event, { color: tokens.text }]} numberOfLines={2}>{title}</Text> : null}
        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

        <SettingsGroup
          title="Partners"
          action={
            adding
              ? { label: 'Cancel', onPress: () => { setAdding(false); setFormError(''); } }
              : { label: 'Add', onPress: () => setAdding(true) }
          }
        >
          {partners.length === 0 && !adding ? (
            <SettingsRow icon={icon} label="Add a partner" onPress={() => setAdding(true)} />
          ) : null}
          {partners.map((p) => (
            <SettingsRow
              key={p.id}
              icon={icon}
              label={p.name}
              value={p.registrations.toLocaleString('en-IN')}
              onPress={() => partnerActions(p)}
            />
          ))}
        </SettingsGroup>

        {adding ? (
          <>
            <SettingsGroup plain>
              <FieldRow label="Partner" value={name} onChangeText={(v) => { setName(v); setFormError(''); }} placeholder="e.g. Oqens" autoFocus maxLength={80} />
              <FieldRow
                label="Contact email"
                value={email}
                onChangeText={(v) => { setEmail(v); setFormError(''); }}
                placeholder="Their Unifesto email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              The contact needs a Unifesto account. They see only how many people registered through their link, never who.
            </Text>
            {formError ? <Text style={[styles.error, { color: tokens.danger }]}>{formError}</Text> : null}
            <Button label="Add partner" fullWidth loading={saving} onPress={addPartner} style={{ marginTop: spacing[4] }} />
          </>
        ) : (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            Give a club, community or sponsor its own tracking link. Registrations through it keep their credit for 7 days, even if the person opens other shared links later.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  event: { fontSize: typography.fontSize.xl, marginBottom: spacing[2], ...font('heading') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
