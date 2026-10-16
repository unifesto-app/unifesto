import React, { useLayoutEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router/react-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, CalendarBlank, CaretRight, CheckCircle, Export, Globe, SealCheck, UsersThree } from '@unifesto/unicon/react-native';
import Skeleton from '../components/Skeleton';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { Rail, Section, GUTTER } from '../components/home/Section';
import PosterCard from '../components/home/PosterCard';
import { SpaceCard } from '../components/home/SpaceCards';
import { PeopleBlock } from '../components/event/EventSections';
import { ActionBar, useActionBarSpace } from '../components/event/EventOverlays';
import { HeaderActions, HeaderIconButton, HeaderMenu, MENU_ICONS } from '../navigation/HeaderActions';
import { useSpaceDetail, type SpaceDetail } from '../hooks/useSpaceDetail';
import useTopSpacing from '../hooks/useTopSpacing';
import { useBannerAccent } from '../hooks/useBannerPalette';
import ReportSheet from '../components/ReportSheet';
import { brandHeaderOptions } from '../components/BrandHeaderTitle';
import type { Event } from '../lib/api/events';
import { relativeWhen, shortPrice, spaceBanner, spaceLogo } from '../utils/eventFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { CosmosWash, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';
import { coverOr, logoOr, useDefaultImages } from '../lib/defaultImages';
import { useBrandFont } from '../lib/brandFont';

const LOGO = 76;
const ICON = 24;
/** Past events shown in the rail; older ones live on the web. */
const PAST_LIMIT = 12;

/**
 * Space page, same fusion look as the event page: the cosmos sky lit by the
 * space's colour (an approved white-label colour, else the banner's hue).
 * Identity (4:3 banner + 1:1 logo), a stats card, about, then its events,
 * sub-spaces and public team. Joining lives in the bottom bar; share and the
 * overflow menu live in the header.
 */
export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useSpaceDetail(id);
  const bannerHue = useBannerAccent(
    s.space ? spaceBanner(s.space) : null,
    s.space ? { space: s.space.id } : null,
  );
  const hue = s.brandColor || bannerHue;
  return (
    <CosmosWash active={!!hue}>
      <SpaceDetailView s={s} hue={hue} />
    </CosmosWash>
  );
}

function SpaceDetailView({ s, hue }: { s: SpaceDetail; hue: string | null }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const router = useRouter();
  const navigation = useNavigation();
  const topSpacing = useTopSpacing(8);
  const barSpace = useActionBarSpace();
  const { width } = useWindowDimensions();
  const [reportOpen, setReportOpen] = useState(false);
  const { space } = s;
  const brandFont = useBrandFont(space?.branding?.font);
  const [descExpanded, setDescExpanded] = useState(false);

  const bannerW = width - GUTTER * 2;
  const bannerH = Math.round((bannerW * 3) / 4); // space banners are 4:3

  useLayoutEffect(() => {
    navigation.setOptions({
      ...brandHeaderOptions(space?.branding),
      headerRight: () => (
        <HeaderActions>
          <HeaderIconButton onPress={s.share} label="Share space">
            <Export size={24} color={c.text} />
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
  }, [navigation, space, s.website, s.canLeave, c.text]);

  // ── Loading / missing ─────────────────────────────────────────────────────
  if (s.loading) {
    return (
      <View style={[styles.flex, { backgroundColor: c.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER }]}>
        <CosmosBackdrop horizon={false} />
        <Skeleton width={bannerW} height={bannerH} borderRadius={cosmosCardRadius} />
        <Skeleton width={LOGO} height={LOGO} borderRadius={18} style={{ marginTop: -LOGO / 2, marginLeft: spacing[4] }} />
        <Skeleton width="70%" height={26} borderRadius={8} style={{ marginTop: spacing[4] }} />
        <Skeleton width="45%" height={14} borderRadius={7} style={{ marginTop: spacing[3] }} />
        <Skeleton width="100%" height={92} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  if (!space) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <UsersThree size={48} color={c.muted} />
        <Text style={[styles.emptyTitle, { color: c.text }]}>Space not found</Text>
        <AuthButton label="Go back" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing[6], minWidth: 160 }} />
      </View>
    );
  }

  const banner = coverOr(defaults, space.id, spaceBanner(space));
  const logo = logoOr(defaults, space.id, space.branding?.logoUrl || spaceLogo(space));
  const place = [space.city, space.state].filter(Boolean).join(', ');
  const meta = [place || null, space.visibility === 'PRIVATE' ? 'Private space' : 'Public space'].filter(Boolean).join(' · ');
  const eventCount = s.upcoming.length + s.past.length;
  const stats = [
    { label: s.memberCount === 1 ? 'Member' : 'Members', value: s.memberCount },
    { label: 'Upcoming', value: s.upcoming.length },
    { label: eventCount === 1 ? 'Event hosted' : 'Events hosted', value: eventCount },
  ];
  const description = space.description?.trim();
  const websiteLabel = s.website?.replace(/^https?:\/\//i, '').replace(/\/$/, '') ?? null;

  const poster = (e: Event, past = false) => (
    <View key={e.id} style={past ? { opacity: 0.6 } : undefined}>
      <PosterCard
        title={e.title}
        imageUrl={e.coverImageUrl}
        when={relativeWhen(e.startDateTime)}
        where={e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null)}
        price={past ? 'Ended' : shortPrice(e)}
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
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} hue={hue} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: cta.hidden ? spacing[12] : barSpace }}
        refreshControl={
          <RefreshControl
            refreshing={s.refreshing}
            onRefresh={s.refresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {/* ── Hero: 4:3 banner, 1:1 logo over its lower edge, name ── */}
        <View style={{ paddingHorizontal: GUTTER }}>
          <View style={[styles.banner, { width: bannerW, height: bannerH, backgroundColor: c.card }]}>
            {banner ? (
              <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
          </View>
          {/* Ring in the ground colour cuts the logo out of the banner edge. */}
          <View style={[styles.logoWrap, { backgroundColor: c.bg }]}>
            {logo ? (
              <Image source={{ uri: logo }} style={[styles.logo, { backgroundColor: c.card }]} />
            ) : (
              <LinearGradient colors={c.fallback} style={[styles.logo, styles.center]}>
                <Text style={[styles.logoText, { color: c.text }]}>{space.name.charAt(0).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>

          <Text style={[styles.name, { color: c.text }, brandFont && { fontFamily: brandFont }]}>
            {space.name}
            {space.verifiedAt ? (
              <Text accessibilityLabel="Verified">
                {' '}
                <SealCheck size={20} color={c.text} weight="fill" />
              </Text>
            ) : null}
          </Text>
          <Text style={[styles.meta, { color: c.soft }]}>{meta}</Text>

          {s.parent ? (
            <Pressable
              onPress={() => router.push(`/space/${s.parent!.id}`)}
              style={({ pressed }) => [styles.partOf, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityRole="link"
            >
              <Text style={[styles.partOfText, { color: c.muted }]} numberOfLines={1}>
                Part of <Text style={{ color: c.text, ...cosmosFont.strong }}>{s.parent.name}</Text>
              </Text>
              <CaretRight size={12} color={c.muted} />
            </Pressable>
          ) : null}

          {/* ── Stats card: numbers, then membership and website ── */}
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <View style={styles.stats}>
              {stats.map((st) => (
                <View key={st.label} style={styles.stat}>
                  <Text style={[styles.statValue, { color: c.text }]}>{compact(st.value)}</Text>
                  <Text style={[styles.statLabel, { color: c.muted }]} numberOfLines={1}>{st.label}</Text>
                </View>
              ))}
            </View>
            {s.isMember ? (
              <Row icon={<CheckCircle size={ICON} color={c.text} weight="fill" />} title="You're a member" />
            ) : null}
            {websiteLabel ? (
              <Row
                icon={<Globe size={ICON} color={c.text} />}
                title={websiteLabel}
                trailing={<ArrowUpRight size={15} color={c.muted} />}
                onPress={s.visitWebsite}
              />
            ) : null}
          </View>
        </View>

        {description ? (
          <Section title="About">
            <View style={{ paddingHorizontal: GUTTER }}>
              <Text style={[styles.body, { color: c.soft }]} numberOfLines={descExpanded ? undefined : 6}>
                {description}
              </Text>
              {description.length > 240 ? (
                <Pressable onPress={() => setDescExpanded((v) => !v)} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.link, { color: c.text }]}>{descExpanded ? 'Show less' : 'Read more'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Section>
        ) : null}

        {s.upcoming.length > 0 ? (
          <Section title="Upcoming" subtitle={`${s.upcoming.length} coming up`}>
            <Rail>{s.upcoming.map((e) => poster(e))}</Rail>
          </Section>
        ) : null}

        {eventCount === 0 ? (
          <Section title="Events">
            <View style={[styles.empty, { backgroundColor: c.raised, marginHorizontal: GUTTER }]}>
              <CalendarBlank size={32} color={c.muted} />
              <Text style={[styles.emptyText, { color: c.soft }]}>No events yet. Check back soon.</Text>
            </View>
          </Section>
        ) : null}

        {s.subSpaces.length > 0 ? (
          <Section title="Sub-spaces" subtitle={`${s.subSpaces.length} inside ${space.name}`}>
            <Rail>
              {s.subSpaces.map((sub) => (
                <SpaceCard key={sub.id} space={sub} onPress={() => router.push(`/space/${sub.id}`)} />
              ))}
            </Rail>
          </Section>
        ) : null}

        {s.past.length > 0 ? (
          <Section title="Past events" subtitle={`${s.past.length} hosted`}>
            <Rail>{s.past.slice(0, PAST_LIMIT).map((e) => poster(e, true))}</Rail>
          </Section>
        ) : null}

        {s.team.length > 0 ? <PeopleBlock title="Team" people={s.team} /> : null}

        {!space.verifiedAt ? (
          <Text style={[styles.disclaimer, { color: c.muted }]}>
            This space is run by its members. Unifesto has not verified that it is affiliated with or endorsed by any
            organisation it names. Represent that organisation?{' '}
            <Text
              style={{ color: c.soft, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL('https://unifesto.app/grievance#organisations')}
              accessibilityRole="link"
            >
              Let us know
            </Text>
          </Text>
        ) : null}
      </ScrollView>

      {!cta.hidden ? (
        <ActionBar
          info={{ label: cta.infoLabel, value: cta.infoValue }}
          label={cta.buttonLabel}
          disabled={cta.disabled}
          loading={s.membershipBusy}
          // Silver, the cosmos primary, like the event page's register button.
          tone="neutral"
          accent={c.primary}
          onPress={s.isMember ? s.confirmLeave : s.join}
          backdropImage={banner}
          backdropColor={c.bg}
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
  );
}

/** A line under the stats: bare icon, label, optional trailing mark. */
function Row({ icon, title, trailing, onPress }: {
  icon: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  const c = useCosmos();
  const content = (
    <>
      {icon}
      <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{title}</Text>
      {trailing}
    </>
  );
  const style = [styles.row, { borderTopColor: c.border }];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={title}
      style={({ pressed }) => [style, pressed && { backgroundColor: c.tint }]}
    >
      {content}
    </Pressable>
  );
}

/** 1.2k-style counts so three stats fit one row. */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  logoWrap: {
    marginTop: -LOGO / 2,
    marginLeft: spacing[4],
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: 22,
  },
  logo: { width: LOGO, height: LOGO, borderRadius: 18, overflow: 'hidden' },
  logoText: { fontSize: 28, ...cosmosFont.display },
  // Michroma runs wide: 24 reads like a 30 in a narrower face.
  name: { marginTop: spacing[4], fontSize: 24, lineHeight: 33, ...cosmosFont.display },
  disclaimer: { marginTop: spacing[10], paddingHorizontal: GUTTER, fontSize: typography.fontSize.xs, lineHeight: 18, ...cosmosFont.body },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  partOf: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing[3] },
  partOfText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  card: { marginTop: spacing[6], borderRadius: cosmosCardRadius, overflow: 'hidden' },
  stats: { flexDirection: 'row', paddingVertical: spacing[5], paddingHorizontal: spacing[2] },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.display },
  statLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.6, ...cosmosFont.body },
  link: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  empty: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[8], borderRadius: cosmosCardRadius },
  emptyText: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  emptyTitle: { marginTop: spacing[4], fontSize: 17, ...cosmosFont.display },
});

interface JoinCta {
  hidden: boolean;
  infoLabel: string;
  infoValue: string;
  buttonLabel: string;
  disabled: boolean;
}

/**
 * Bottom bar for the Space screen. Non-members see the member count + "Join";
 * members get no bar (leaving lives in the header menu, so it would be a dead
 * button). Signed-out users are prompted by handleJoinLeave.
 */
function resolveJoinCta(params: {
  isMember: boolean;
  joiningLoading: boolean;
  user: boolean;
  memberCount: number;
  spaceName: string;
}): JoinCta {
  const { isMember, joiningLoading, memberCount, spaceName } = params;

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
