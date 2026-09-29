import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LinkSimple } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  createShortLink,
  getShortLinks,
  revokeShortLink,
  scopeFromParams,
  scopeParams,
  type ShortLink,
} from '../lib/api/traffic';
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

/** What a link points at, for its row. */
export function shortLinkLabel(l: ShortLink): string {
  if (l.title) return l.title;
  if (l.event) return l.event.title;
  if (l.target === 'SPACE') return l.space?.name ?? 'Space page';
  return l.url.replace(/^https:\/\//, '').split('?')[0];
}

/**
 * Tracked short links (api.unifesto.app/l/<code>) for one event, one space
 * (its page and its events' links), or the whole platform (Apex). Each link
 * counts clicks and the registrations it brings in.
 */
export default function ShortLinksScreen() {
  const params = useLocalSearchParams<{ scope: string; scopeId?: string; title?: string }>();
  const scope = useMemo(() => scopeFromParams(params), [params.scope, params.scopeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = params.title;
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useAnalyticsScreenTracking('ShortLinks');

  const load = useCallback(async () => {
    if (!scope) return;
    const res = await getShortLinks(scope);
    if (res.ok) {
      setLinks(res.data);
      setError('');
    } else setError(res.denied ? 'You need access to see these links.' : res.message);
  }, [scope]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const share = (l: ShortLink) => void shareLink({ message: title || shortLinkLabel(l), url: l.shortUrl, title });

  const copy = async (l: ShortLink) => {
    try {
      await Clipboard.setStringAsync(l.shortUrl);
      AppAlert.alert('Link copied', l.shortUrl);
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  const add = async () => {
    if (!scope) return;
    if (scope.kind === 'admin' && !url.trim()) {
      setFormError('Paste the unifesto.app page this link should open.');
      return;
    }
    setSaving(true);
    setFormError('');
    const res = await createShortLink(scope, {
      title: name.trim() || undefined,
      source: source.trim() || undefined,
      ...(scope.kind === 'admin' ? { url: url.trim() } : {}),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError(res.denied ? 'You don’t have permission to create links here.' : res.message);
      return;
    }
    setName('');
    setSource('');
    setUrl('');
    setAdding(false);
    await load();
    AppAlert.alert('Link ready', res.data.shortUrl, [
      { text: 'Done', style: 'cancel' },
      { text: 'Copy', onPress: () => void copy(res.data) },
      { text: 'Share', onPress: () => share(res.data) },
    ]);
  };

  const actions = (l: ShortLink) =>
    AppAlert.alert(shortLinkLabel(l), l.shortUrl, [
      { text: 'Copy link', onPress: () => void copy(l) },
      { text: 'Share link', onPress: () => share(l) },
      {
        text: 'See stats',
        onPress: () =>
          router.push({ pathname: '/short-link', params: { ...scopeParams(scope!), linkId: l.id } }),
      },
      {
        text: 'Turn off link',
        style: 'destructive',
        onPress: () =>
          AppAlert.alert('Turn off this link?', 'It stops redirecting and opens the Unifesto home page instead. Registrations it already brought in stay counted.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Turn off',
              style: 'destructive',
              onPress: async () => {
                const res = await revokeShortLink(scope!, l.id);
                if (!res.ok) AppAlert.alert('Could not turn off', res.message);
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

  const icon = <LinkSimple size={ICON} color={tokens.accent} weight="bold" />;
  const destination =
    scope?.kind === 'event' ? 'this event' : scope?.kind === 'space' ? 'the space page' : 'any unifesto.app page';

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
        {title ? <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{title}</Text> : null}
        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

        <SettingsGroup
          title="Short links"
          action={
            adding
              ? { label: 'Cancel', onPress: () => { setAdding(false); setFormError(''); } }
              : { label: 'New', onPress: () => setAdding(true) }
          }
        >
          {links.length === 0 && !adding ? (
            <SettingsRow icon={icon} label="Create a short link" onPress={() => setAdding(true)} />
          ) : null}
          {links.map((l) => (
            <SettingsRow
              key={l.id}
              icon={icon}
              label={shortLinkLabel(l)}
              value={`${fmtCount(l.clicks, 'click')} · ${fmtCount(l.registrations, 'reg')}`}
              onPress={() => actions(l)}
            />
          ))}
        </SettingsGroup>

        {adding ? (
          <>
            <SettingsGroup plain>
              <FieldRow
                label="Name"
                value={name}
                onChangeText={(v) => { setName(v); setFormError(''); }}
                placeholder="e.g. Instagram bio"
                autoFocus
                maxLength={120}
              />
              <FieldRow
                label="Source"
                value={source}
                onChangeText={(v) => { setSource(v); setFormError(''); }}
                placeholder="e.g. instagram (optional)"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={60}
              />
              {scope?.kind === 'admin' ? (
                <FieldRow
                  label="Page"
                  value={url}
                  onChangeText={(v) => { setUrl(v); setFormError(''); }}
                  placeholder="https://www.unifesto.app/…"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : null}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              The link opens {destination}. Registrations through it show up in Tracking under its source.
            </Text>
            {formError ? <Text style={[styles.error, { color: tokens.danger }]}>{formError}</Text> : null}
            <Button label="Create link" fullWidth loading={saving} onPress={add} style={{ marginTop: spacing[4] }} />
          </>
        ) : (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            Give each place you post its own link to see which one brings people in. Tap a link to copy, share or see its stats.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fmtCount = (n: number, unit: string) => `${n.toLocaleString('en-IN')} ${unit}${n === 1 ? '' : 's'}`;

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize.xl, marginBottom: spacing[2], ...font('heading') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
