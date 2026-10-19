import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { getManagedEvent } from '../lib/api/eventAdmin';
import { SECTIONS, type ContentItem, type ContentSection } from '../lib/api/eventContent';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const TABS: { value: ContentSection; label: string }[] = [
  { value: 'agenda', label: 'Agenda' },
  { value: 'speakers', label: 'Speakers' },
  { value: 'prizes', label: 'Prizes' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'faqs', label: 'FAQs' },
];

type Lists = Record<ContentSection, ContentItem[]>;

/**
 * What the public event page shows below the details: agenda, speakers,
 * prizes, contacts and FAQs. Pick a section, tap a row to edit, or add one.
 * Changes go live as soon as they're saved.
 */
export default function EventContentScreen() {
  const { eventId, section: initial } = useLocalSearchParams<{ eventId: string; section?: ContentSection }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [section, setSection] = useState<ContentSection>(initial ?? 'agenda');
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getManagedEvent(eventId);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const e = res.data as unknown as Partial<Lists>;
    setError('');
    setLists({
      agenda: e.agenda ?? [],
      speakers: e.speakers ?? [],
      prizes: e.prizes ?? [],
      contacts: e.contacts ?? [],
      faqs: e.faqs ?? [],
    });
  }, [eventId]);

  // Reload on focus so a saved or deleted item shows straight away.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const def = SECTIONS[section];
  const items = lists?.[section] ?? [];
  const open = (itemId: string) =>
    router.push({ pathname: `/manage/event/${eventId}/content-item`, params: { section, itemId } });

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
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
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      <ChipPicker options={TABS} value={section} onChange={(v) => v && setSection(v)} />

      {!lists ? (
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text>
              <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
            </>
          ) : (
            <ActivityIndicator color={tokens.accent} />
          )}
        </View>
      ) : (
        <>
          <SettingsGroup title={`${items.length} ${items.length === 1 ? def.noun : `${def.noun}s`}`}>
            {items.length === 0 ? <SettingsRow label={`No ${def.noun}s yet`} /> : null}
            {items
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((item) => {
                const s = def.summary(item);
                return (
                  <View key={item.id}>
                    <SettingsRow label={s.title || 'Untitled'} onPress={() => open(item.id)} />
                    {s.sub ? (
                      <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={2} onPress={() => open(item.id)}>
                        {s.sub}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
          </SettingsGroup>

          <Button
            label={`Add ${def.noun}`}
            variant="secondary"
            fullWidth
            icon={<Plus size={18} color={tokens.text} weight="bold" />}
            onPress={() => open('new')}
            style={{ marginTop: spacing[5] }}
          />
          <Text style={[styles.note, { color: tokens.textMuted }]}>Shown on the public event page. Saved changes go live at once.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { alignItems: 'center', paddingVertical: spacing[10] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  sub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.4, ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
});
