import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ClockCounterClockwise, MagnifyingGlass, X } from '@unifesto/unicon/react-native';
import { GlassView } from 'expo-glass-effect';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import { useStableTopInset } from '../CustomHeader';
import Skeleton from '../Skeleton';
import type { Event } from '../../lib/api/events';
import type { HomeSearch } from '../../hooks/useHomeSearch';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import { relativeWhen, shortPrice, spaceLogo } from '../../utils/eventFormat';
import PressableScale from '../ui/PressableScale';

interface SearchSheetProps {
  search: HomeSearch;
  categories: { id: string; name: string }[];
  trending: Event[];
  popularSpaces: any[];
  onOpenEvent: (event: Event) => void;
  onOpenSpace: (space: any) => void;
  onOpenCategory: (name: string) => void;
  onSubmit: (term: string) => void;
}

export default function SearchSheet({
  search,
  categories,
  trending,
  popularSpaces,
  onOpenEvent,
  onOpenSpace,
  onOpenCategory,
  onSubmit,
}: SearchSheetProps) {
  const c = useCosmos();
  const isDark = c.scheme === 'dark';
  const topInset = useStableTopInset();
  const s = search;

  const rememberAnd = (fn: () => void) => () => {
    if (s.query.trim()) s.saveRecentSearch(s.query);
    s.closeSheet();
    fn();
  };

  // Events show their 4:3 banner; spaces show their 1:1 logo.
  const Row = ({ title, sub, meta, image, shape, onPress }: { title: string; sub?: string | null; meta?: string | null; image?: string | null; shape: 'banner' | 'logo'; onPress: () => void }) => (
    <PressableScale feedback="inline"
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[shape === 'banner' ? styles.thumbBanner : styles.thumbLogo, { backgroundColor: c.card }]}>
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} style={[StyleSheet.absoluteFill, styles.center]}>
            <Text style={[styles.thumbText, { color: c.muted }]}>{title.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: c.soft }]} numberOfLines={1}>{sub}</Text> : null}
        {meta ? <Text style={[styles.rowSub, { color: c.muted }]} numberOfLines={1}>{meta}</Text> : null}
      </View>
    </PressableScale>
  );

  const eventRow = (e: Event) => (
    <Row
      key={e.id}
      title={e.title}
      sub={relativeWhen(e.startDateTime)}
      meta={[e.space?.name, shortPrice(e)].filter(Boolean).join(' · ')}
      image={e.coverImageUrl}
      shape="banner"
      onPress={rememberAnd(() => onOpenEvent(e))}
    />
  );

  const spaceRow = (sp: any) => {
    const members = sp.member_count ?? sp._count?.members;
    const events = sp.event_count ?? sp._count?.events;
    const meta = [
      members != null ? `${members} member${members === 1 ? '' : 's'}` : null,
      events != null ? `${events} event${events === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' · ');
    return (
      <Row
        key={sp.id}
        title={sp.name}
        sub={sp.city}
        meta={meta}
        image={spaceLogo(sp)}
        shape="logo"
        onPress={rememberAnd(() => onOpenSpace(sp))}
      />
    );
  };

  const Chip = ({ label, icon, onPress }: { label: string; icon?: React.ReactNode; onPress: () => void }) => (
    <PressableScale
      onPress={onPress}
      style={[
        styles.chip,
        LIQUID_GLASS ? { borderWidth: 0 } : { backgroundColor: c.card, borderColor: c.border },
      ]}
    >
      <GlassFill interactive />
      {icon}
      <Text style={[styles.chipText, { color: c.text }]} numberOfLines={1}>{label}</Text>
    </PressableScale>
  );

  const BlockTitle = ({ title, action }: { title: string; action?: React.ReactNode }) => (
    <View style={styles.blockHeader}>
      <Text style={[styles.blockTitle, { color: c.soft }]}>{title}</Text>
      {action}
    </View>
  );

  const results = s.type === 'events' ? s.eventResults : s.spaceResults;

  return (
    // iOS: a native page sheet. It rises from the bottom and leaves the same way
    // (swipe down, which also fires onRequestClose) with the page behind pushed
    // back; Cancel sits where iOS search puts it. Android ignores
    // presentationStyle and stays full screen under the status bar.
    <Modal
      visible={s.open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={s.closeSheet}
      statusBarTranslucent
    >
      <View
        style={[
          styles.container,
          { backgroundColor: c.bg, paddingTop: Platform.OS === 'ios' ? spacing[4] : topInset + spacing[2] },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.field, LIQUID_GLASS ? { borderWidth: 0 } : { backgroundColor: c.card, borderColor: c.border }]}>
            {LIQUID_GLASS ? (
              <GlassView
                glassEffectStyle="regular"
                colorScheme={isDark ? 'dark' : 'light'}
                style={[StyleSheet.absoluteFill, { borderRadius: cosmosRadius }]}
                pointerEvents="none"
              />
            ) : null}
            <MagnifyingGlass size={18} color={c.muted} />
            <TextInput
              ref={s.inputRef}
              style={[styles.input, { color: c.text }]}
              placeholder={s.type === 'events' ? 'Search events' : 'Search spaces'}
              placeholderTextColor={c.muted}
              selectionColor={c.primary}
              value={s.query}
              onChangeText={s.onChangeQuery}
              onSubmitEditing={() => onSubmit(s.query)}
              returnKeyType="search"
              autoCorrect={false}
              autoFocus
            />
            {s.query !== '' && (
              <PressableScale feedback="inline" onPress={s.clear} hitSlop={10} style={[styles.clear, { backgroundColor: c.muted }]} accessibilityLabel="Clear search">
                <X size={11} color={c.bg} weight="bold" />
              </PressableScale>
            )}
          </View>
          <PressableScale feedback="inline" onPress={s.closeSheet} hitSlop={10} style={styles.cancel} accessibilityRole="button">
            <Text style={[styles.cancelText, { color: c.text }]}>Cancel</Text>
          </PressableScale>
        </View>

        <View style={[styles.segment, { backgroundColor: LIQUID_GLASS ? undefined : c.card }]}>
          <GlassFill interactive />
          {(['events', 'spaces'] as const).map((t) => {
            const active = s.type === t;
            const count = t === 'events' ? s.eventResults.length : s.spaceResults.length;
            return (
              <Pressable
                key={t}
                onPress={() => s.setType(t)}
                style={[styles.segmentBtn, active && { backgroundColor: c.card }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, { color: active ? c.text : c.muted }]}>
                  {t === 'events' ? 'Events' : 'Spaces'}
                  {s.isSearching && !s.loading && count > 0 ? `  ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {!s.isSearching ? (
            <>
              {s.recentSearches.length > 0 && (
                <View style={styles.block}>
                  <BlockTitle
                    title="Recent"
                    action={
                      <PressableScale feedback="inline" onPress={s.clearRecentSearches} hitSlop={10} accessibilityRole="button">
                        <Text style={[styles.blockAction, { color: c.soft }]}>Clear</Text>
                      </PressableScale>
                    }
                  />
                  <View style={styles.chips}>
                    {s.recentSearches.map((term) => (
                      <Chip
                        key={term}
                        label={term}
                        icon={<ClockCounterClockwise size={13} color={c.muted} />}
                        onPress={() => s.runTerm(term)}
                      />
                    ))}
                  </View>
                </View>
              )}

              {s.type === 'events' && categories.length > 0 && (
                <View style={styles.block}>
                  <BlockTitle title="Browse by vibe" />
                  <View style={styles.chips}>
                    {categories.map((c) => (
                      <Chip key={c.id} label={c.name} onPress={() => { s.closeSheet(); onOpenCategory(c.name); }} />
                    ))}
                  </View>
                </View>
              )}

              {s.type === 'events' && trending.length > 0 && (
                <View style={styles.block}>
                  <BlockTitle title="Trending now" />
                  {trending.slice(0, 5).map(eventRow)}
                </View>
              )}

              {s.type === 'spaces' && popularSpaces.length > 0 && (
                <View style={styles.block}>
                  <BlockTitle title="Popular spaces" />
                  {popularSpaces.slice(0, 5).map(spaceRow)}
                </View>
              )}
            </>
          ) : s.loading ? (
            [0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={styles.row}>
                <Skeleton width={72} height={54} borderRadius={borderRadius.md} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="75%" height={14} borderRadius={6} />
                  <Skeleton width="45%" height={12} borderRadius={6} />
                </View>
              </View>
            ))
          ) : results.length > 0 ? (
            <>
              <BlockTitle
                title={`${results.length} ${s.type === 'events' ? 'event' : 'space'}${results.length === 1 ? '' : 's'}`}
                action={
                  s.type === 'events' ? (
                    <PressableScale feedback="inline" onPress={() => onSubmit(s.query)} hitSlop={10} accessibilityRole="button">
                      <Text style={[styles.blockAction, { color: c.primary }]}>View all</Text>
                    </PressableScale>
                  ) : undefined
                }
              />
              {s.type === 'events' ? s.eventResults.map(eventRow) : s.spaceResults.map(spaceRow)}
            </>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MagnifyingGlass size={36} color={c.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No matches for “{s.query.trim()}”</Text>
              <Text style={[styles.emptyText, { color: c.muted }]}>
                {s.type === 'events' ? 'Try a different word, or browse a vibe.' : 'Try a different name or city.'}
              </Text>
              {s.type === 'events' && categories.length > 0 && (
                <View style={[styles.chips, { justifyContent: 'center', marginTop: spacing[4] }]}>
                  {categories.slice(0, 6).map((c) => (
                    <Chip key={c.id} label={c.name} onPress={() => { s.closeSheet(); onOpenCategory(c.name); }} />
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[5] },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cancelText: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  field: {
    flex: 1,
    height: 48,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  input: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...cosmosFont.body },
  clear: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segment: {
    flexDirection: 'row',
    marginHorizontal: spacing[5],
    marginTop: spacing[4],
    padding: 4,
    borderRadius: cosmosRadius + 4,
  },
  segmentBtn: { flex: 1, height: 36, borderRadius: cosmosRadius, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  body: { paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[16] },
  block: { marginBottom: spacing[6] },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] },
  blockTitle: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  blockAction: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    marginHorizontal: -spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.lg,
  },
  thumbBanner: { width: 72, height: 54, borderRadius: borderRadius.md, overflow: 'hidden' },
  thumbLogo: { width: 54, height: 54, borderRadius: borderRadius.md, overflow: 'hidden', marginHorizontal: 9 },
  center: { alignItems: 'center', justifyContent: 'center' },
  thumbText: { fontSize: 18, ...cosmosFont.display },
  rowTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  rowSub: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  empty: { alignItems: 'center', paddingTop: spacing[12], paddingHorizontal: spacing[4] },
  emptyIcon: { marginBottom: spacing[4] },
  emptyTitle: { fontSize: typography.fontSize.lg, textAlign: 'center', ...cosmosFont.strong },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', marginTop: 6, ...cosmosFont.body },
});
