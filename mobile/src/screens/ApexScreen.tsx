import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import {
  ArrowUpRight,
  Article,
  ArrowsClockwise,
  Briefcase,
  ArrowsLeftRight,
  Bank,
  BellRinging,
  Buildings,
  CalendarBlank,
  CaretDown,
  CaretRight,
  ChartBar,
  ChartLineUp,
  CheckCircle,
  CloudArrowDown,
  CreditCard,
  DeviceMobile,
  EnvelopeSimple,
  Flag,
  Globe,
  HandCoins,
  ImageSquare,
  Lifebuoy,
  LinkBreak,
  MagnifyingGlass,
  Megaphone,
  Pulse,
  Receipt,
  ShieldCheck,
  Stack,
  Tag,
  Terminal,
  Tray,
  Users,
  VideoCamera,
  Wallet,
  WhatsappLogo,
  X,
  type Icon,
} from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { CardBackdrop, GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';
import Skeleton from '../components/Skeleton';
import PressableScale from '../components/ui/PressableScale';
import { AppAlert } from '../components/ui/AppAlert';
import { AreaChart, BarChart, BarList, Meter, Ring } from '../components/apex/MiniCharts';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { titleCase } from '../lib/apexQueues';
import {
  getAdminPayouts,
  getAdminRefunds,
  getFinancialTimeseries,
  getGrowthTimeseries,
  getPlatformOverview,
  getPlatformStatus,
  getWhatsappStats,
  type AnalyticsRange,
  type FinancialPoint,
  type GrowthPoint,
  type PlatformOverview,
  type PlatformStatus,
} from '../lib/api/apex';
import { getAllBankAccounts } from '../lib/api/apexMoney';
import { getTicketStats, listContentReports } from '../lib/api/apexSupport';
import { getTraffic, type PlatformTrafficStats } from '../lib/api/traffic';
import { pendingCounts } from '../lib/apexQueues';
import { overallLabel } from './apex/PlatformStatusScreen';
import { inrShort } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];
const GAP = spacing[3];
/** One inner padding for every card and tile, so edges line up across the page. */
const PAD = spacing[4];
const ICON = 20;
const APEX_WEB_URL = 'https://apex.unifesto.app';

/** Things that can be waiting on me; each maps to a tool below. */
type CountKey = 'requests' | 'reports' | 'support' | 'whatsapp' | 'payouts' | 'refunds' | 'bankAccounts';
type Counts = Record<CountKey, number | null>;
const NO_COUNTS: Counts = { requests: null, reports: null, support: null, whatsapp: null, payouts: null, refunds: null, bankAccounts: null };

interface Tool {
  label: string;
  icon: Icon;
  to: Href;
  /** Extra search words admins might type ("approve", "money"). */
  keywords?: string;
  count?: CountKey;
  /** Short name on the "Waiting on me" tile. */
  short?: string;
}

/*
 * Every Apex tool, grouped by the job an admin is doing. The section list and
 * the search results both render from this, so they can't drift apart.
 */
const SECTIONS: { title: string; tools: Tool[] }[] = [
  {
    title: 'Review & reply',
    tools: [
      { label: 'Requests', icon: Tray, to: '/apex/requests', count: 'requests', keywords: 'approve queue ownership white label sub-space free add' },
      { label: 'Reported content', icon: Flag, to: '/apex/reports', count: 'reports', short: 'Reports', keywords: 'moderation abuse' },
      { label: 'Support', icon: Lifebuoy, to: '/apex/support', count: 'support', keywords: 'tickets help inbox' },
      { label: 'WhatsApp inbox', icon: WhatsappLogo, to: '/apex/whatsapp', count: 'whatsapp', short: 'WhatsApp', keywords: 'chat messages reply' },
    ],
  },
  {
    title: 'Money',
    tools: [
      { label: 'Settlements', icon: HandCoins, to: '/apex/money/settlements', count: 'payouts', keywords: 'payouts pay' },
      { label: 'Refunds', icon: ArrowsClockwise, to: '/apex/money/refunds', count: 'refunds' },
      { label: 'Payout accounts', icon: Bank, to: '/apex/money/bank-accounts', count: 'bankAccounts', short: 'Bank accounts', keywords: 'bank verify' },
      { label: 'Financials', icon: Wallet, to: '/apex/money/financials', keywords: 'revenue earnings' },
      { label: 'Subscriptions', icon: CreditCard, to: '/apex/subscriptions', keywords: 'billing plan mrr revenue share' },
      { label: 'Transactions', icon: Receipt, to: '/apex/money/transactions', keywords: 'payments razorpay' },
      { label: 'Reconciliation', icon: ArrowsLeftRight, to: '/apex/money/reconciliation' },
      { label: 'Orphaned payments', icon: LinkBreak, to: '/apex/money/orphaned-payments' },
    ],
  },
  {
    title: 'Find',
    tools: [
      { label: 'Users', icon: Users, to: '/apex/users', keywords: 'people accounts' },
      { label: 'Spaces', icon: Buildings, to: '/apex/spaces', keywords: 'organisations orgs' },
      { label: 'Events', icon: CalendarBlank, to: '/apex/events' },
      { label: 'Sessions', icon: VideoCamera, to: '/apex/sessions', keywords: 'huddle online live' },
    ],
  },
  {
    title: 'Reach people',
    tools: [
      { label: 'Push notifications', icon: BellRinging, to: '/apex/push', keywords: 'broadcast announce' },
      { label: 'Email campaigns', icon: EnvelopeSimple, to: '/apex/email', keywords: 'newsletter marketing' },
      { label: 'WhatsApp blast', icon: Megaphone, to: '/apex/whatsapp/broadcast', keywords: 'broadcast' },
      { label: 'Stats recipients', icon: ChartLineUp, to: '/apex/stats-recipients' },
    ],
  },
  {
    title: 'Configure',
    tools: [
      { label: 'Plans', icon: Stack, to: '/apex/plans', keywords: 'features limits pricing billing gate' },
      { label: 'Roles & access', icon: ShieldCheck, to: '/apex/iam', keywords: 'iam permissions capabilities' },
      { label: 'Categories', icon: Tag, to: '/apex/categories' },
      { label: 'Default images', icon: ImageSquare, to: '/apex/default-images' },
      { label: 'App version', icon: DeviceMobile, to: '/apex/app-version', keywords: 'force update' },
      { label: 'OTA updates', icon: CloudArrowDown, to: '/apex/ota', keywords: 'release rollout expo' },
    ],
  },
  {
    title: 'Health',
    tools: [
      { label: 'Status', icon: Pulse, to: '/apex/status', keywords: 'uptime outage' },
      { label: 'Traffic', icon: ChartBar, to: '/apex/traffic', keywords: 'analytics' },
      { label: 'Logs', icon: Terminal, to: '/apex/logs', keywords: 'errors api requests debug 500' },
    ],
  },
  {
    title: 'Publish',
    tools: [
      { label: 'Blog', icon: Article, to: '/apex/blog', keywords: 'posts articles markdown' },
      { label: 'Careers', icon: Briefcase, to: '/apex/careers', keywords: 'jobs hiring applications' },
    ],
  },
];

const ALL_TOOLS = SECTIONS.flatMap((s) => s.tools);

/** Pulse ranges; traffic is capped at 365 days by the backend. */
const RANGES: { key: AnalyticsRange; label: string; days: number; short: string }[] = [
  { key: '7d', label: '7D', days: 7, short: '7 days' },
  { key: '1m', label: '1M', days: 30, short: '30 days' },
  { key: '6m', label: '6M', days: 180, short: '6 months' },
  { key: '12m', label: '12M', days: 365, short: '12 months' },
];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Latest bucket vs the one before, e.g. "+12% vs Sep". Null when there's no base. */
function trend(values: number[], labels: string[]) {
  const n = values.length;
  if (n < 2 || values[n - 2] <= 0) return null;
  const d = Math.round(((values[n - 1] - values[n - 2]) / values[n - 2]) * 100);
  return `${d >= 0 ? '+' : '−'}${Math.abs(d)}% vs ${labels[n - 2]}`;
}

/**
 * Platform-admin tab on one page: what's waiting on me, a visual pulse of the
 * platform (revenue, growth, reach, traffic), then every tool in sections of
 * compact tiles. Search swaps all of it for matching tools.
 */
export default function ApexScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const c = useCosmos();
  const topInset = useStableTopInset();
  const { width, fontScale } = useWindowDimensions();
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [money, setMoney] = useState<FinancialPoint[] | null>(null);
  const [growth, setGrowth] = useState<GrowthPoint[] | null>(null);
  const [traffic, setTraffic] = useState<PlatformTrafficStats | null>(null);
  const [byStatus, setByStatus] = useState<{ events: { status: string; count: number }[]; spaces: { status: string; count: number }[] } | null>(null);
  const [range, setRange] = useState<AnalyticsRange>('6m');
  const [counts, setCounts] = useState<Counts>(NO_COUNTS);
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [moreStats, setMoreStats] = useState(false);

  useAnalyticsScreenTracking('Apex');

  const load = useCallback(async () => {
    // Everything in parallel; a failing count or chart just stays blank.
    const [overview, queues, refunds, payouts, wa, sys, banks, support, reports] = await Promise.all([
      getPlatformOverview(),
      pendingCounts(),
      getAdminRefunds('PENDING_ADMIN'),
      getAdminPayouts('PENDING'),
      getWhatsappStats(),
      getPlatformStatus(),
      getAllBankAccounts({ status: 'PENDING', limit: 1 }),
      getTicketStats(),
      listContentReports({ status: 'OPEN' }),
    ]);
    if (overview.ok) {
      setData(overview.data);
      setError('');
    } else {
      setError(overview.denied ? 'Only Unifesto platform admins can see this.' : overview.message);
    }
    setCounts({
      requests: Object.values(queues).reduce<number>((sum, n) => sum + (n ?? 0), 0),
      refunds: refunds.ok ? refunds.data.pagination?.total ?? refunds.data.requests.length : null,
      payouts: payouts.ok ? payouts.data.pagination?.total ?? payouts.data.payouts.length : null,
      whatsapp: wa.ok ? wa.data.unread : null,
      bankAccounts: banks.ok ? banks.data.pagination.total : null,
      support: support.ok ? support.data.open : null,
      reports: reports.ok ? reports.data.length : null,
    });
    setCountsLoaded(true);
    setStatus(sys.ok ? sys.data : null);
  }, []);

  // Pulse charts follow the range switch; a failing chart just stays empty.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const loadSeries = useCallback(async (r: AnalyticsRange) => {
    const days = RANGES.find((x) => x.key === r)?.days ?? 30;
    const [fin, grow, trf] = await Promise.all([
      getFinancialTimeseries(r),
      getGrowthTimeseries(r),
      getTraffic<PlatformTrafficStats>({ kind: 'admin' }, days),
    ]);
    if (rangeRef.current !== r) return; // a newer range won
    setMoney(fin.ok ? fin.data.months : []);
    setGrowth(grow.ok ? grow.data.months : []);
    setByStatus(grow.ok ? { events: grow.data.eventsByStatus, spaces: grow.data.spacesByStatus } : null);
    setTraffic(trf.ok ? trf.data : null);
  }, []);

  const pickRange = (r: AnalyticsRange) => {
    setRange(r);
    setMoney(null);
    setGrowth(null);
    void loadSeries(r);
  };

  // Numbers and queues move all day; refresh whenever the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      void load();
      void loadSeries(rangeRef.current);
    }, [load, loadSeries]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadSeries(range)]);
    setRefreshing(false);
  };

  const loading = !data && !error;
  const updated = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;
  const sys = status ? overallLabel(status, tokens) : null;
  const countOf = (t: Tool) => (t.count ? counts[t.count] ?? 0 : 0);
  const fmt = (n: number) => n.toLocaleString('en-IN');

  // Non-zero queues, busiest first.
  const waiting = ALL_TOOLS.filter((t) => countOf(t) > 0).sort((a, b) => countOf(b) - countOf(a));
  const waitingTotal = waiting.reduce((sum, t) => sum + countOf(t), 0);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (q ? ALL_TOOLS.filter((t) => `${t.label} ${t.short ?? ''} ${t.keywords ?? ''}`.toLowerCase().includes(q)) : []),
    [q],
  );

  const open = (to: Href) => router.push(to);
  // Three tiles per row, two once large text would truncate the labels; half-width chart cards.
  const cols = fontScale > 1.3 ? 2 : 3;
  const tileW = (width - GUTTER * 2 - GAP * (cols - 1)) / cols;
  const halfW = (width - GUTTER * 2 - GAP) / 2;

  const moneyVals = money?.map((m) => m.collected) ?? [];
  const moneyLabels = money?.map((m) => m.label) ?? [];
  const userVals = growth?.map((g) => g.newUsers) ?? [];
  const regVals = growth?.map((g) => g.newRegistrations) ?? [];
  const spaceVals = growth?.map((g) => g.newSpaces) ?? [];
  const eventVals = growth?.map((g) => g.newEvents) ?? [];
  const rangeShort = RANGES.find((r) => r.key === range)!.short;
  const span = `the last ${rangeShort}`;
  const growthLabels = growth?.map((g) => g.label) ?? [];
  const views = traffic?.daily.map((d) => d.views) ?? [];
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const viewLabels = traffic?.daily.map((d) => dayLabel(d.date)) ?? [];

  const toolTile = (t: Tool) => {
    const n = countOf(t);
    const isStatus = t.to === '/apex/status';
    return (
      <PressableScale
        key={t.label}
        onPress={() => open(t.to)}
        accessibilityRole="button"
        accessibilityLabel={n ? `${t.label}, ${n} waiting` : isStatus && sys ? `${t.label}, ${sys.text}` : t.label}
        style={[styles.tile, { width: tileW }]}
      >
        <CardBackdrop shape={styles.tile} />
        <View style={styles.tileTop}>
          <t.icon size={ICON} color={isStatus && sys ? sys.color : c.text} />
          {n ? (
            <View style={[styles.count, { backgroundColor: `${tokens.warning}26` }]}>
              <Text style={[styles.countText, { color: c.warn }]}>{fmt(n)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tileLabel, { color: c.text }]} numberOfLines={2}>
          {t.label}
        </Text>
      </PressableScale>
    );
  };

  /** Michroma section heading behind a short silver rule, like Home's sections. */
  const heading = (title: string, extra?: string) => (
    <View style={styles.heading}>
      <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
      <Text accessibilityRole="header" style={[styles.headingText, { color: c.text }]}>
        {title}
        {extra ? <Text style={{ color: c.warn }}>{`  ${extra}`}</Text> : null}
      </Text>
    </View>
  );

  /** Tappable card holding a headline number and a chart; reads as one sentence to screen readers. */
  const chartCard = (p: {
    title: string;
    value: string;
    sub?: string | null;
    a11y: string;
    to: Href;
    w?: number;
    children: React.ReactNode;
  }) => (
    <PressableScale
      key={p.title}
      onPress={() => open(p.to)}
      accessibilityRole="button"
      accessibilityLabel={p.a11y}
      style={[styles.card, p.w ? { width: p.w } : null]}
    >
      <CardBackdrop shape={styles.card} />
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { color: c.muted }]} numberOfLines={1}>
          {p.title}
        </Text>
        <CaretRight size={14} color={c.muted} />
      </View>
      {loading ? (
        <Skeleton width={80} height={22} />
      ) : (
        <Text style={[styles.cardValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {p.value}
        </Text>
      )}
      {p.sub ? (
        <Text style={[styles.cardSub, { color: c.soft }]} numberOfLines={1}>
          {p.sub}
        </Text>
      ) : null}
      <View style={styles.cardChart}>{p.children}</View>
    </PressableScale>
  );

  const chartOrSkeleton = (ready: boolean, chart: React.ReactNode, h = 72) =>
    ready ? chart : <Skeleton width="100%" height={h} borderRadius={8} />;

  return (
    <View style={styles.container}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[tokens.accent]} progressViewOffset={topInset} />
        }
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: topInset + spacing[4] }]}>
          <Text accessibilityRole="header" style={[styles.pageTitle, { color: c.text }]}>
            Apex
          </Text>
          {sys || updated ? (
            <Pressable
              onPress={() => open('/apex/status')}
              disabled={!sys}
              accessibilityRole="button"
              accessibilityLabel={[sys && `Platform status: ${sys.text}`, updated && `updated ${updated}`].filter(Boolean).join(', ')}
              hitSlop={8}
              style={({ pressed }) => [styles.statusPill, { backgroundColor: c.tint, opacity: pressed ? 0.6 : 1 }]}
            >
              {sys ? <View style={[styles.dot, { backgroundColor: sys.color }]} /> : null}
              <Text style={[styles.statusText, { color: c.soft }]} numberOfLines={1}>
                {[sys?.text, updated].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: c.danger }]}>
            {error}
          </Text>
        ) : null}

        {/* ── Search ─────────────────────────────────────────────── */}
        <View style={[styles.search, !LIQUID_GLASS && { backgroundColor: c.card }]}>
          <GlassFill radius={cosmosRadius} interactive />
          <MagnifyingGlass size={18} color={c.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find a tool, e.g. refunds"
            placeholderTextColor={c.muted}
            style={[styles.searchInput, { color: c.text }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
            accessibilityLabel="Find an Apex tool"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>

        {q ? (
          <>
            <Text accessibilityLiveRegion="polite" style={[styles.resultCount, { color: c.muted }]}>
              {results.length ? `${results.length} ${results.length === 1 ? 'tool' : 'tools'}` : `No tool matches “${query.trim()}”`}
            </Text>
            <View style={styles.grid}>{results.map(toolTile)}</View>
          </>
        ) : (
          <>
            {/* ── Waiting on me ──────────────────────────────────── */}
            {heading('Waiting on me', waitingTotal > 0 ? fmt(waitingTotal) : undefined)}
            {!countsLoaded ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.rail}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width={124} height={92} borderRadius={cosmosCardRadius} />
                ))}
              </ScrollView>
            ) : waiting.length === 0 ? (
              <View style={styles.clear} accessible accessibilityLabel="All clear. Nothing is waiting on me.">
                <CardBackdrop shape={styles.clear} />
                <CheckCircle size={24} color={tokens.success} weight="fill" />
                <Text style={[styles.clearText, { color: c.text }]}>All clear, nothing waiting on me</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.rail}>
                {waiting.map((t) => {
                  const n = countOf(t);
                  const name = t.short ?? t.label;
                  return (
                    <PressableScale
                      key={t.label}
                      onPress={() => open(t.to)}
                      accessibilityRole="button"
                      accessibilityLabel={`${name}, ${n} waiting`}
                      style={styles.need}
                    >
                      <CardBackdrop shape={styles.need} />
                      <View style={styles.tileTop}>
                        <t.icon size={16} color={c.soft} />
                        <Text style={[styles.needCount, { color: c.warn }]}>{fmt(n)}</Text>
                      </View>
                      <Text style={[styles.needLabel, { color: c.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      {/* Share of everything waiting. */}
                      <Meter frac={n / waitingTotal} color={tokens.warning} />
                    </PressableScale>
                  );
                })}
              </ScrollView>
            )}

            {/* ── Pulse: visual overview ─────────────────────────── */}
            {heading('Pulse')}
            <View style={styles.rangeWrap}>
              <SegmentedTabs tabs={RANGES} value={range} onChange={pickRange} />
            </View>

            {chartCard({
              // B14: the headline is paid ticket bookings (GMV, same as Apex
              // web Overview); the line under it is everything collected in the
              // range, seats, stays and since-refunded payments included, so it
              // can be larger and says so.
              title: 'Gross sales (GMV)',
              value: data ? inrShort(data.revenue.totalPaid) : '—',
              sub: money?.length
                ? [`${inrShort(sum(moneyVals))} collected in ${span} (all sales)`, trend(moneyVals, moneyLabels)].filter(Boolean).join(' · ')
                : null,
              a11y: `Gross sales, ${data ? inrShort(data.revenue.totalPaid) : 'loading'}. Collected in ${span}: ${moneyLabels
                .map((l, i) => `${l} ${inrShort(moneyVals[i])}`)
                .join(', ')}`,
              to: '/apex/money/financials',
              children: chartOrSkeleton(!!money, <AreaChart values={moneyVals} labels={moneyLabels} height={56} format={inrShort} />, 56),
            })}

            <View style={styles.pair}>
              {chartCard({
                title: 'Total users',
                value: data ? fmt(data.users.total) : '—',
                sub: growth?.length ? `+${fmt(sum(userVals))} in ${rangeShort}` : null,
                a11y: `Total users, ${data ? fmt(data.users.total) : 'loading'}. New users: ${growthLabels.map((l, i) => `${l} ${userVals[i]}`).join(', ')}`,
                to: '/apex/users',
                w: halfW,
                children: chartOrSkeleton(!!growth, <BarChart values={userVals} labels={growthLabels} height={40} />, 40),
              })}
              {chartCard({
                title: 'Total bookings',
                value: data ? fmt(data.registrations.total) : '—',
                sub: growth?.length ? `+${fmt(sum(regVals))} in ${rangeShort}` : null,
                a11y: `Total bookings, ${data ? fmt(data.registrations.total) : 'loading'}. New: ${growthLabels.map((l, i) => `${l} ${regVals[i]}`).join(', ')}`,
                to: '/apex/money/transactions',
                w: halfW,
                children: chartOrSkeleton(!!growth, <BarChart values={regVals} labels={growthLabels} height={40} />, 40),
              })}
            </View>

            {/* Secondary stats stay folded so the tools aren't buried. */}
            <PressableScale
              feedback="inline"
              onPress={() => setMoreStats((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: moreStats }}
              hitSlop={8}
              style={styles.moreStats}
            >
              <Text style={[styles.webText, { color: c.soft }]}>{moreStats ? 'Fewer stats' : 'More stats'}</Text>
              <CaretDown size={14} color={c.soft} style={moreStats ? { transform: [{ rotate: '180deg' }] } : undefined} />
            </PressableScale>

            {moreStats ? (
              <>
                {money?.length
                  ? chartCard({
                      title: `Where the money went · ${span}`,
                      value: inrShort(sum(money.map((m) => m.netRevenue))),
                      sub: 'Net after fees and refunds',
                      a11y: `Money in ${span}: collected ${inrShort(sum(moneyVals))}, fees ${inrShort(sum(money.map((m) => m.processingFees)))}, refunded ${inrShort(sum(money.map((m) => m.refunded)))}, net ${inrShort(sum(money.map((m) => m.netRevenue)))}`,
                      to: '/apex/money/financials',
                      children: (
                        <BarList
                          items={[
                            { key: 'in', label: 'Collected', value: sum(moneyVals), display: inrShort(sum(moneyVals)) },
                            { key: 'fee', label: 'Processing fees', value: sum(money.map((m) => m.processingFees)), display: inrShort(sum(money.map((m) => m.processingFees))) },
                            { key: 'ref', label: 'Refunded', value: sum(money.map((m) => m.refunded)), display: inrShort(sum(money.map((m) => m.refunded))) },
                            { key: 'net', label: 'Net', value: sum(money.map((m) => m.netRevenue)), display: inrShort(sum(money.map((m) => m.netRevenue))) },
                          ]}
                        />
                      ),
                    })
                  : null}

                <View style={styles.pair}>
                  {chartCard({
                    title: 'New spaces',
                    value: growth ? fmt(sum(spaceVals)) : '—',
                    sub: `in ${rangeShort}`,
                    a11y: `New spaces in ${span}: ${fmt(sum(spaceVals))}. ${growthLabels.map((l, i) => `${l} ${spaceVals[i]}`).join(', ')}`,
                    to: '/apex/spaces',
                    w: halfW,
                    children: chartOrSkeleton(!!growth, <BarChart values={spaceVals} labels={growthLabels} height={40} />, 40),
                  })}
                  {chartCard({
                    title: 'New events',
                    value: growth ? fmt(sum(eventVals)) : '—',
                    sub: `in ${rangeShort}`,
                    a11y: `New events in ${span}: ${fmt(sum(eventVals))}. ${growthLabels.map((l, i) => `${l} ${eventVals[i]}`).join(', ')}`,
                    to: '/apex/events',
                    w: halfW,
                    children: chartOrSkeleton(!!growth, <BarChart values={eventVals} labels={growthLabels} height={40} />, 40),
                  })}
                </View>

                <View style={styles.pair}>
                  {[
                    { title: 'Spaces active', part: data?.spaces.active ?? 0, whole: data?.spaces.total ?? 0, to: '/apex/spaces' as Href },
                    { title: 'Events published', part: data?.events.published ?? 0, whole: data?.events.total ?? 0, to: '/apex/events' as Href },
                  ].map((r) => (
                    <PressableScale
                      key={r.title}
                      onPress={() => open(r.to)}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.title}: ${fmt(r.part)} of ${fmt(r.whole)}`}
                      style={[styles.ringCard, { width: halfW }]}
                    >
                      <CardBackdrop shape={styles.ringCard} />
                      {loading ? <Skeleton width={44} height={44} borderRadius={22} /> : <Ring part={r.part} whole={r.whole} size={44} />}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ringValue, { color: c.text }]} numberOfLines={1}>
                          {data ? `${fmt(r.part)}/${fmt(r.whole)}` : '—'}
                        </Text>
                        <Text style={[styles.cardTitle, { color: c.muted }]} numberOfLines={2}>
                          {r.title}
                        </Text>
                      </View>
                    </PressableScale>
                  ))}
                </View>

                {byStatus ? (
                  <View style={styles.pair}>
                    {[
                      { title: 'Events by status', rows: byStatus.events, to: '/apex/events' as Href },
                      { title: 'Spaces by status', rows: byStatus.spaces, to: '/apex/spaces' as Href },
                    ].map((b) =>
                      chartCard({
                        title: b.title,
                        value: fmt(sum(b.rows.map((r) => r.count))),
                        a11y: `${b.title}: ${b.rows.map((r) => `${titleCase(r.status)} ${r.count}`).join(', ')}`,
                        to: b.to,
                        w: halfW,
                        children: (
                          <BarList
                            items={[...b.rows]
                              .sort((x, y) => y.count - x.count)
                              .map((r) => ({ key: r.status, label: titleCase(r.status), value: r.count }))}
                          />
                        ),
                      }),
                    )}
                  </View>
                ) : null}

                {traffic
                  ? chartCard({
                      title: `Views · last ${traffic.days} days`,
                      value: fmt(traffic.views),
                      sub: `${fmt(traffic.visitors)} visitors · ${fmt(traffic.registrations)} registrations`,
                      a11y: `Views in the last ${traffic.days} days, ${fmt(traffic.views)}, from ${fmt(traffic.visitors)} visitors`,
                      to: '/apex/traffic',
                      children: <AreaChart values={views} labels={viewLabels} height={44} />,
                    })
                  : null}

                {traffic?.topEvents.length
                  ? chartCard({
                      title: 'Top events by views',
                      value: traffic.topEvents[0].title ?? '—',
                      a11y: `Top events by views: ${traffic.topEvents.slice(0, 5).map((e) => `${e.title} ${e.views}`).join(', ')}`,
                      to: '/apex/traffic',
                      children: (
                        <BarList
                          items={traffic.topEvents.slice(0, 5).map((e) => ({
                            key: e.id,
                            label: e.title ?? e.slug,
                            value: e.views,
                            onPress: () => open(`/apex/events/${e.id}`),
                          }))}
                        />
                      ),
                    })
                  : null}

                {traffic?.topSpaces.length
                  ? chartCard({
                      title: 'Top spaces by views',
                      value: traffic.topSpaces[0].name ?? '—',
                      a11y: `Top spaces by views: ${traffic.topSpaces.slice(0, 5).map((e) => `${e.name} ${e.views}`).join(', ')}`,
                      to: '/apex/traffic',
                      children: (
                        <BarList
                          items={traffic.topSpaces.slice(0, 5).map((e) => ({
                            key: e.id,
                            label: e.name ?? e.slug,
                            value: e.views,
                            onPress: () => open(`/apex/spaces/${e.id}`),
                          }))}
                        />
                      ),
                    })
                  : null}
              </>
            ) : null}

            {/* ── Tools, in sections ─────────────────────────────── */}
            {SECTIONS.map((s) => (
              <View key={s.title}>
                {heading(s.title)}
                <View style={styles.grid}>{s.tools.map(toolTile)}</View>
              </View>
            ))}

            <Pressable
              onPress={() => Linking.openURL(APEX_WEB_URL).catch(() => AppAlert.alert('Error', 'Unable to open Apex'))}
              accessibilityRole="link"
              accessibilityLabel="Open Apex on the web"
              hitSlop={8}
              style={({ pressed }) => [styles.webLink, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Globe size={16} color={c.muted} />
              <Text style={[styles.webText, { color: c.muted }]}>Open Apex on the web</Text>
              <ArrowUpRight size={14} color={c.muted} />
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 140 },
  pageTitle: { fontSize: 26, lineHeight: 34, ...cosmosFont.display },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    minHeight: 30,
    borderRadius: 999,
    flexShrink: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flexShrink: 1, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  error: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 48,
    marginTop: spacing[5],
    paddingHorizontal: spacing[4],
    borderRadius: cosmosRadius,
  },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...cosmosFont.body },
  resultCount: { marginTop: spacing[5], marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  heading: { marginTop: spacing[8], marginBottom: spacing[3] },
  rule: { width: 32, height: 1, marginBottom: spacing[2] },
  // Michroma runs wide: smaller than it looks.
  headingText: { fontSize: 15, lineHeight: 22, ...cosmosFont.display },
  // Rails run edge to edge; the first card still lines up with the gutter.
  bleed: { marginHorizontal: -GUTTER },
  rail: { paddingHorizontal: GUTTER, gap: GAP },
  need: { minWidth: 124, borderRadius: cosmosCardRadius, padding: PAD, gap: spacing[2] },
  needCount: { fontSize: typography.fontSize.lg, lineHeight: 24, ...cosmosFont.display },
  needLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  clear: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: PAD, borderRadius: cosmosCardRadius },
  clearText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, padding: PAD, gap: 4, marginBottom: GAP },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  cardTitle: { flexShrink: 1, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  cardValue: { fontSize: typography.fontSize.lg, lineHeight: 26, ...cosmosFont.display },
  cardSub: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  cardChart: { marginTop: spacing[3] },
  pair: { flexDirection: 'row', gap: GAP },
  rangeWrap: { marginBottom: GAP },
  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: cosmosCardRadius,
    padding: PAD,
    marginBottom: GAP,
  },
  ringValue: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { minHeight: 84, borderRadius: cosmosCardRadius, padding: PAD, justifyContent: 'space-between', gap: spacing[2] },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 999 },
  countText: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  tileLabel: { fontSize: typography.fontSize.xs, lineHeight: 16, ...cosmosFont.strong },
  moreStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  webLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing[8], minHeight: 44 },
  webText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
