import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Buildings, Globe, Plus } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { useStableTopInset } from '../components/CustomHeader';
import BrandGlow from '../components/ui/BrandGlow';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { activeEvents, adminSpaces, hostedSpaces, hostingRoleLabel } from '../lib/spaceSections';
import { relativeWhen } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';
import SponsorMark from '../components/manage/SponsorMark';

const GUTTER = spacing[6];
const ICON = 28;
const SPACE_WEB_URL = 'https://space.unifesto.app';

/**
 * The operator tab. Shown only to Space Admins, Curators, Co-Curators, Crew,
 * Judges, Mentors and sponsor staff; each section appears only for the roles that need it.
 */
export default function SpaceScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topInset = useStableTopInset();
  const { sections, loaded, spaces, checkinEvents, judgingEvents, sponsorships, refresh } = useSpaceAccess();
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('Space');

  // Pick up new assignments whenever the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Lost every operator role while sitting here: the tab is gone, so leave it.
  useEffect(() => {
    if (loaded && sections.length === 0) router.navigate('/(tabs)');
  }, [loaded, sections.length, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const now = new Date();
  const unicon = (name: GlyphName) => <UnGlyph name={name} size={ICON} color={tokens.text} />;
  const checkin = activeEvents(checkinEvents, now);
  const judging = activeEvents(judgingEvents, now);

  // New event goes straight to the form; with several spaces, ask which one.
  const creatable = adminSpaces(hostedSpaces(spaces));
  const newEvent = () => {
    const open = (id: string) => router.push(`/manage/space/${id}/new-event`);
    if (creatable.length === 1) return open(creatable[0].id);
    AppAlert.alert('New event in…', undefined, [
      ...creatable.map((s) => ({ text: s.name, onPress: () => open(s.id) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const hosting = (
    <SettingsGroup key="hosting" title="My spaces">
      {creatable.length > 0 ? (
        <SettingsRow icon={<Plus size={ICON} color={tokens.accent} weight="bold" />} label="New event" onPress={newEvent} />
      ) : null}
      {hostedSpaces(spaces).map((s) => (
        <SettingsRow
          key={s.id}
          icon={
            s.logo_url ? (
              <Image source={{ uri: s.logo_url }} style={styles.logo} />
            ) : (
              <Buildings size={ICON} color={tokens.accent} weight="fill" />
            )
          }
          label={s.name}
          value={hostingRoleLabel(s)}
          onPress={() => router.push(`/manage/space/${s.id}`)}
        />
      ))}
      <SettingsRow
        icon={<Globe size={ICON} color={tokens.accent} weight="fill" />}
        label="Manage on the web"
        external
        onPress={() =>
          Linking.openURL(SPACE_WEB_URL).catch(() => AppAlert.alert('Error', 'Unable to open Unifesto Space'))
        }
      />
    </SettingsGroup>
  );

  const checkinGroup = (
    <SettingsGroup key="checkin" title="Check-in">
      {checkin.length === 0 ? (
        <SettingsRow icon={unicon('qr-code')} label="No events to check in right now" />
      ) : (
        checkin.map((ev) => (
          <SettingsRow
            key={ev.id}
            icon={unicon('qr-code')}
            label={ev.title}
            value={relativeWhen(ev.startDateTime, now)}
            onPress={() =>
              router.push({
                pathname: `/checkin/${ev.id}`,
                params: { title: ev.title, startDateTime: ev.startDateTime, venueName: ev.venueName || ev.city || '' },
              })
            }
          />
        ))
      )}
    </SettingsGroup>
  );

  const judgingGroup = (
    <SettingsGroup key="judging" title="Judging">
      {(judging.length > 0 ? judging : judgingEvents).map((ev) => (
        <SettingsRow
          key={ev.boardId}
          icon={unicon('hammer')}
          label={ev.title}
          value={ev.kind === 'MENTOR' ? 'Mentor' : 'Judge'}
          onPress={() => router.push({ pathname: `/judging/${ev.eventId}`, params: { title: ev.title } })}
        />
      ))}
    </SettingsGroup>
  );

  const sponsoringGroup = (
    <SettingsGroup key="sponsoring" title="Sponsoring">
      {sponsorships.map((sp) => {
        const live = sp.events.filter((e) => e.leadCaptureEnabled).length;
        return (
          <SettingsRow
            key={sp.sponsorId}
            icon={<SponsorMark name={sp.name} logoUrl={sp.logoUrl} size={ICON} />}
            label={sp.name}
            value={sp.leadCount ? `${sp.leadCount} lead${sp.leadCount === 1 ? '' : 's'}` : live ? 'Ready to scan' : sp.spaceName}
            onPress={() => router.push(`/sponsoring/${sp.sponsorId}`)}
          />
        );
      })}
    </SettingsGroup>
  );

  const render = { hosting, checkin: checkinGroup, judging: judgingGroup, sponsoring: sponsoringGroup };

  // A plain View wraps the ScrollView so the native tab host doesn't add its
  // own safe-area inset on top of the header's (see mobile-tab-top-spacing).
  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <BrandGlow />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topInset}
          />
        }
      >
        <View style={{ paddingTop: topInset + spacing[4] }}>
          <Text style={[styles.pageTitle, { color: tokens.text }]}>Space</Text>
          <Text style={[styles.subtitle, { color: tokens.textMuted }]}>Everything I run, check in, judge and sponsor.</Text>
        </View>

        {!loaded ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
        ) : (
          <View style={{ marginTop: spacing[4] }}>{sections.map((s) => render[s])}</View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 140 },
  pageTitle: {
    fontSize: typography.fontSize['4xl'],
    lineHeight: typography.fontSize['4xl'] * 1.1,
    letterSpacing: -0.8,
    ...font('heading'),
  },
  subtitle: { marginTop: 6, fontSize: typography.fontSize.sm, ...font() },
  logo: { width: ICON, height: ICON, borderRadius: borderRadius.sm },
});
