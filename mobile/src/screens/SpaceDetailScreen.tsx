import React, { useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarBlank, CaretRight, Export, UsersThree } from 'phosphor-react-native';
import Skeleton from '../components/Skeleton';
import { Rail, Section, GUTTER } from '../components/home/Section';
import PosterCard from '../components/home/PosterCard';
import { SpaceCard } from '../components/home/SpaceCards';
import { PeopleBlock } from '../components/event/EventSections';
import { ActionBar } from '../components/event/EventOverlays';
import { HeaderActions, HeaderIconButton, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import { useSpaceDetail } from '../hooks/useSpaceDetail';
import useTopSpacing from '../hooks/useTopSpacing';
import { useBannerPalette } from '../hooks/useBannerPalette';
import ReportSheet from '../components/ReportSheet';
import { useTokens } from '../context/ThemeContext';
import type { Event } from '../lib/api/events';
import { relativeWhen, shortPrice, spaceBanner, spaceLogo } from '../utils/eventFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';
import BannerRim from '../components/ui/BannerRim';
import { CardSurfaceProvider, DEFAULT_CARD_SURFACE } from '../components/ui/CardSurface';

const LOGO = 76;

/**
 * Space page: identity (4:3 banner + 1:1 logo), a few numbers, about, then
 * its events (upcoming / past rails), sub-spaces and public team. Joining
 * lives in the bottom bar; share and the overflow menu live in the header.
 */
export default function SpaceDetailScreen() {
  const tokens = useTokens();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSpaceDetail(id);
  const [reportOpen, setReportOpen] = useState(false);
  const { space } = s;
  const [descExpanded, setDescExpanded] = useState(false);

  // White-label: an approved organiser colour replaces the accent here.
  const accent = s.brandColor || tokens.accent;
  const bannerW = width - GUTTER * 2;
  const bannerH = Math.round((bannerW * 3) / 4); // space banners are 4:3
  // Page background: light → dark shades of the banner's most frequent colour.
  // Hook runs before the loading/error returns, so pass the banner URL directly.
  const palette = useBannerPalette(space ? spaceBanner(space) : null, space ? { space: space.id } : null);
  // The colour right behind the banner + logo (top of the wash), else the theme bg.
  const pageTop = palette ? palette[0] : tokens.bg;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderActions>
          <HeaderIconButton onPress={s.share} label="Share space">
            <Export size={24} color={tokens.text} />
          </HeaderIconButton>
          <HeaderMenu
            title={space?.name || 'Space'}
            items={[
              { id: 'copy', title: 'Copy link', icon: MENU_ICONS.copyLink },
              ...(s.website ? [{ id: 'website', title: 'Visit website', icon: MENU_ICONS.website }] : []),
              ...(s.canLeave ? [{ id: 'leave', title: 'Leave space', icon: MENU_ICONS.leave, destructive: true }] : []),
              { id: 'report', title: 'Report space', icon: MENU_ICONS.report, destructive: true },
            ]}
            onSelect={(action) => {
              if (action === 'copy') s.copyLink();
              else if (action === 'website') s.visitWebsite();
              else if (action === 'leave') s.confirmLeave();
              else if (action === 'report') setReportOpen(true);
            }}
          />
        </HeaderActions>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, space, s.website, s.canLeave, tokens.text]);

  // ── Loading / missing ─────────────────────────────────────────────────────
  if (s.loading) {
    return (
      <View style={[styles.flex, { backgroundColor: tokens.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER }]}>
        <Skeleton width={bannerW} height={bannerH} borderRadius={borderRadius.xl} />
        <Skeleton width={LOGO} height={LOGO} borderRadius={borderRadius.xl} style={{ marginTop: -LOGO / 2, marginLeft: spacing[4] }} />
        <Skeleton width="70%" height={28} borderRadius={8} style={{ marginTop: spacing[4] }} />
        <Skeleton width="45%" height={14} borderRadius={7} style={{ marginTop: spacing[3] }} />
      </View>
    );
  }

  if (!space) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: tokens.bg }]}>
        <UsersThree size={48} color={tokens.textSecondary} weight="duotone" />
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>Space not found</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.link, { color: accent }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const banner = spaceBanner(space);
  const logo = spaceLogo(space);
  const place = [space.city, space.state].filter(Boolean).join(', ');
  const meta = [place || null, space.visibility === 'PRIVATE' ? 'Private space' : 'Public space'].filter(Boolean).join(' · ');
  const eventCount = s.upcoming.length + s.past.length;
  const stats = [
    { label: s.memberCount === 1 ? 'Member' : 'Members', value: s.memberCount },
    { label: eventCount === 1 ? 'Event' : 'Events', value: eventCount },
    ...(s.subSpaces.length > 0 ? [{ label: s.subSpaces.length === 1 ? 'Sub-space' : 'Sub-spaces', value: s.subSpaces.length }] : []),
  ];
  const description = space.description?.trim();

  const poster = (e: Event, faded = false) => (
    <View key={e.id} style={faded ? { opacity: 0.6 } : undefined}>
      <PosterCard
        title={e.title}
        imageUrl={e.coverImageUrl}
        when={relativeWhen(e.startDateTime)}
        where={e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null)}
        price={faded ? undefined : shortPrice(e)}
        onPress={() => router.push(`/event/${e.slug || e.id}`)}
      />
    </View>
  );

  const cta = resolveJoinCta({
    isMember: s.isMember,
    joiningLoading: s.membershipBusy,
    user: !!s.user,
    memberCount: s.memberCount,
    spaceName: space.name,
  });

  return (
    <CardSurfaceProvider kind={palette ? 'glass' : DEFAULT_CARD_SURFACE}>
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      {palette ? (
        <LinearGradient
          colors={palette}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 150 }}>
        <View style={{ paddingHorizontal: GUTTER }}>
          {/* Banner (4:3) with the 1:1 logo overlapping its lower edge */}
          <View style={[styles.banner, { width: bannerW, height: bannerH, backgroundColor: tokens.elevated }]}>
            {banner ? (
              <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={[accent, tokens.accentStrong]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            <BannerRim radius={borderRadius.xl} color={pageTop} />
          </View>
          <View style={[styles.logoWrap, { backgroundColor: pageTop }]}>
            {logo ? (
              <Image source={{ uri: logo }} style={[styles.logo, { backgroundColor: tokens.elevated }]} />
            ) : (
              <LinearGradient colors={[accent, tokens.accentStrong]} style={[styles.logo, styles.center]}>
                <Text style={styles.logoText}>{space.name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>

          <Text style={[styles.name, { color: tokens.text }]}>{space.name}</Text>
          <Text style={[styles.meta, { color: tokens.textSecondary }]}>{meta}</Text>

          {s.parent ? (
            <Pressable onPress={() => router.push(`/space/${s.parent!.id}`)} style={styles.partOf} accessibilityRole="link">
              <Text style={[styles.partOfText, { color: tokens.textSecondary }]} numberOfLines={1}>
                Part of <Text style={{ color: tokens.text, ...font('semibold') }}>{s.parent.name}</Text>
              </Text>
              <CaretRight size={12} color={tokens.textMuted} weight="bold" />
            </Pressable>
          ) : null}

          {/* Numbers: bare, no tiles */}
          <View style={styles.stats}>
            {stats.map((st) => (
              <View key={st.label}>
                <Text style={[styles.statValue, { color: tokens.text }]}>{st.value}</Text>
                <Text style={[styles.statLabel, { color: tokens.textMuted }]}>{st.label}</Text>
              </View>
            ))}
          </View>

          {description ? (
            <View style={{ marginTop: spacing[8] }}>
              <Text style={[styles.blockTitle, { color: tokens.text }]}>About</Text>
              <Text style={[styles.body, { color: tokens.textSecondary }]} numberOfLines={descExpanded ? undefined : 6}>
                {description}
              </Text>
              {description.length > 240 ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8}>
                  <Text style={[styles.link, { color: accent }]}>{descExpanded ? 'Show less' : 'Read more'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {s.upcoming.length > 0 ? (
          <Section title="Upcoming">
            <Rail>{s.upcoming.map((e) => poster(e))}</Rail>
          </Section>
        ) : null}

        {s.past.length > 0 ? (
          <Section title="Past events">
            <Rail>{s.past.slice(0, 12).map((e) => poster(e, true))}</Rail>
          </Section>
        ) : null}

        {eventCount === 0 ? (
          <View style={styles.noEvents}>
            <CalendarBlank size={36} color={tokens.textSecondary} weight="duotone" />
            <Text style={[styles.noEventsText, { color: tokens.textMuted }]}>No events yet</Text>
          </View>
        ) : null}

        {s.subSpaces.length > 0 ? (
          <Section title="Sub-spaces">
            <Rail>
              {s.subSpaces.map((sub) => (
                <SpaceCard key={sub.id} space={sub} onPress={() => router.push(`/space/${sub.id}`)} />
              ))}
            </Rail>
          </Section>
        ) : null}

        {s.team.length > 0 ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: spacing[10] }}>
            <PeopleBlock title="Team" people={s.team} />
          </View>
        ) : null}
      </ScrollView>

      {!cta.hidden ? (
        <ActionBar
          info={{ label: cta.infoLabel, value: cta.infoValue }}
          label={cta.buttonLabel}
          disabled={cta.disabled}
          loading={s.membershipBusy}
          tone={s.isMember ? 'neutral' : 'accent'}
          accent={accent}
          onPress={s.isMember ? s.confirmLeave : s.join}
          backdropImage={banner}
          backdropColor={palette?.[2]}
        />
      ) : null}
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="SPACE"
        targetId={s.space?.id}
        subject={s.space?.name}
      />
    </View>
    </CardSurfaceProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  logoWrap: {
    marginTop: -LOGO / 2,
    marginLeft: spacing[4],
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: borderRadius.xl + 4,
  },
  logo: { width: LOGO, height: LOGO, borderRadius: borderRadius.xl, overflow: 'hidden' },
  logoText: { fontSize: 30, color: '#ffffff', ...font('heading') },
  name: {
    marginTop: spacing[3],
    fontSize: typography.fontSize['3xl'],
    lineHeight: typography.fontSize['3xl'] * 1.15,
    letterSpacing: -0.5,
    ...font('heading'),
  },
  meta: { marginTop: 4, fontSize: typography.fontSize.sm, ...font() },
  partOf: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing[3] },
  partOfText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...font() },
  stats: { flexDirection: 'row', gap: spacing[8], marginTop: spacing[6] },
  statValue: { fontSize: typography.fontSize['2xl'], ...font('heading') },
  statLabel: { fontSize: typography.fontSize.sm, ...font() },
  blockTitle: { fontSize: typography.fontSize.lg, marginBottom: spacing[2], ...font('heading') },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.55, ...font() },
  link: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('semibold') },
  noEvents: { alignItems: 'center', gap: spacing[2], marginTop: spacing[10] },
  noEventsText: { fontSize: typography.fontSize.sm, ...font() },
  emptyTitle: { marginTop: spacing[4], fontSize: typography.fontSize.lg, ...font('heading') },
});

interface JoinCta {
  hidden: boolean;
  infoLabel: string;
  infoValue: string;
  buttonLabel: string;
  disabled: boolean;
}

/**
 * TODO(learning): Decide the join/member CTA behaviour.
 *
 * This shapes the core action of the Space screen. The Event screen keeps its
 * bottom bar visible and swaps the button label per state; here you must also
 * decide what to do once someone is already a member (leaving is handled from
 * the header menu, so the bar has no obvious job for members).
 *
 * Consider:
 *  - Non-member, logged in    -> show member count + "Join {space}"
 *  - Not logged in            -> prompt to sign in (handleJoinLeave already alerts)
 *  - Joining in-flight        -> disable + "Joining..."
 *  - Already a member         -> hide the bar? Or keep it as a passive
 *                                "You're a member" strip with no button?
 *
 * Trade-offs: hiding the bar for members reclaims screen space and avoids a
 * dead button, but removes the at-a-glance member count. Keeping a passive
 * strip is informative but competes with the header's Leave action.
 *
 * Return a JoinCta describing the bar. Keep it a pure function of its inputs.
 */
function resolveJoinCta(params: {
  isMember: boolean;
  joiningLoading: boolean;
  user: boolean;
  memberCount: number;
  spaceName: string;
}): JoinCta {
  const { isMember, joiningLoading, memberCount, spaceName } = params;

  // Placeholder default so the screen compiles — replace with your decision.
  if (isMember) {
    return { hidden: true, infoLabel: '', infoValue: '', buttonLabel: '', disabled: true };
  }

  const memberLabel = memberCount === 1 ? '1 member' : `${memberCount} members`;
  return {
    hidden: false,
    infoLabel: 'community',
    infoValue: memberLabel,
    buttonLabel: joiningLoading ? 'Joining...' : `Join ${spaceName}`,
    disabled: joiningLoading,
  };
}
