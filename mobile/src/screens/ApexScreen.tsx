import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  Bank,
  BellRinging,
  Buildings,
  CalendarBlank,
  ChartBar,
  ChartLineUp,
  DeviceMobile,
  EnvelopeSimple,
  Flag,
  Lifebuoy,
  Globe,
  HandCoins,
  ImageSquare,
  LinkBreak,
  Megaphone,
  Pulse,
  Receipt,
  ShieldCheck,
  Tag,
  Tray,
  Users,
  Wallet,
  WhatsappLogo,
  type Icon,
} from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { useStableTopInset } from '../components/CustomHeader';
import BrandGlow from '../components/ui/BrandGlow';
import ManageStats from '../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Badge } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import {
  getAdminPayouts,
  getAdminRefunds,
  getPlatformOverview,
  getPlatformStatus,
  getWhatsappStats,
  type PlatformOverview,
  type PlatformStatus,
} from '../lib/api/apex';
import { getAllBankAccounts } from '../lib/api/apexMoney';
import { getTicketStats, listContentReports } from '../lib/api/apexSupport';
import { pendingCounts, type QueueKind } from '../lib/apexQueues';
import { overallLabel } from './apex/PlatformStatusScreen';
import { inrShort } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;
const APEX_WEB_URL = 'https://apex.unifesto.app';

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

interface Counts {
  queues: Partial<Record<QueueKind, number | null>>;
  refunds: number | null;
  payouts: number | null;
  unread: number | null;
  bankAccounts: number | null;
  support: number | null;
  reports: number | null;
}

const NO_COUNTS: Counts = { queues: {}, refunds: null, payouts: null, unread: null, bankAccounts: null, support: null, reports: null };

/**
 * Platform-admin tab: Apex's headline numbers, every queue that needs a
 * decision (busiest first), the WhatsApp inbox, communication consoles (push,
 * email, WhatsApp blast), lookups and system status.
 */
export default function ApexScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topInset = useStableTopInset();
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [counts, setCounts] = useState<Counts>(NO_COUNTS);
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('Apex');

  const load = useCallback(async () => {
    // Everything in parallel; a failing badge just stays blank.
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
      queues,
      refunds: refunds.ok ? refunds.data.pagination?.total ?? refunds.data.requests.length : null,
      payouts: payouts.ok ? payouts.data.pagination?.total ?? payouts.data.payouts.length : null,
      unread: wa.ok ? wa.data.unread : null,
      bankAccounts: banks.ok ? banks.data.pagination.total : null,
      support: support.ok ? support.data.open : null,
      reports: reports.ok ? reports.data.length : null,
    });
    setStatus(sys.ok ? sys.data : null);
  }, []);

  // Numbers and queues move all day; refresh whenever the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loading = !data && !error;
  const updated = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    : null;

  const badge = (n: number | null | undefined) => (n ? <Badge label={String(n)} tone="warning" /> : undefined);
  const glyph = (I: Icon) => <I size={ICON} color={tokens.accent} weight="fill" />;

  // Every decision queue lives on the one Requests screen; the home shows the total.
  const waiting =
    Object.values(counts.queues).reduce<number>((sum, n) => sum + (n ?? 0), 0) + (counts.refunds ?? 0) + (counts.payouts ?? 0);
  const sys = status ? overallLabel(status, tokens) : null;

  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <BrandGlow />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topInset} />
        }
      >
        <View style={{ paddingTop: topInset + spacing[4] }}>
          <Text style={[styles.pageTitle, { color: tokens.text }]}>Apex</Text>
          <Text style={[styles.subtitle, { color: tokens.textMuted }]}>
            {waiting > 0 ? `${waiting} waiting on me` : 'Unifesto at a glance'}
            {updated ? ` · updated ${updated}` : ''}
          </Text>
        </View>

        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

        <View style={styles.stats}>
          <ManageStats
            loading={loading}
            stats={[
              { label: 'Users', value: data?.users.total ?? 0 },
              { label: 'New in 30 days', value: data?.users.newLast30Days ?? 0 },
            ]}
          />
          <ManageStats
            loading={loading}
            stats={[
              { label: 'Spaces', value: data?.spaces.total ?? 0 },
              { label: 'Active', value: data ? pct(data.spaces.active, data.spaces.total) : 0 },
            ]}
          />
          <ManageStats
            loading={loading}
            stats={[
              { label: 'Events', value: data?.events.total ?? 0 },
              { label: 'Published', value: data ? pct(data.events.published, data.events.total) : 0 },
            ]}
          />
          <ManageStats
            loading={loading}
            stats={[
              { label: 'Registrations', value: data?.registrations.total ?? 0 },
              { label: 'Revenue', value: data ? inrShort(data.revenue.totalPaid) : 0 },
            ]}
          />
        </View>

        <SettingsGroup title="Needs review">
          <SettingsRow icon={glyph(Tray)} label="Requests" trailing={badge(waiting)} onPress={() => router.push('/apex/requests')} />
          <SettingsRow icon={glyph(Flag)} label="Reported content" trailing={badge(counts.reports)} onPress={() => router.push('/apex/reports')} />
        </SettingsGroup>

        <SettingsGroup title="Money & ops">
          <SettingsRow icon={glyph(Wallet)} label="Financials" onPress={() => router.push('/apex/money/financials')} />
          <SettingsRow icon={glyph(Receipt)} label="Transactions" onPress={() => router.push('/apex/money/transactions')} />
          <SettingsRow icon={glyph(HandCoins)} label="Settlements" trailing={badge(counts.payouts)} onPress={() => router.push('/apex/money/settlements')} />
          <SettingsRow icon={glyph(ArrowsLeftRight)} label="Reconciliation" onPress={() => router.push('/apex/money/reconciliation')} />
          <SettingsRow icon={glyph(LinkBreak)} label="Orphaned payments" onPress={() => router.push('/apex/money/orphaned-payments')} />
          <SettingsRow icon={glyph(Bank)} label="Payout accounts" trailing={badge(counts.bankAccounts)} onPress={() => router.push('/apex/money/bank-accounts')} />
          <SettingsRow icon={glyph(ArrowsClockwise)} label="Refunds" trailing={badge(counts.refunds)} onPress={() => router.push('/apex/money/refunds')} />
        </SettingsGroup>

        <SettingsGroup title="Inbox">
          <SettingsRow
            icon={glyph(WhatsappLogo)}
            label="WhatsApp"
            trailing={badge(counts.unread)}
            onPress={() => router.push('/apex/whatsapp')}
          />
          <SettingsRow icon={glyph(Lifebuoy)} label="Support" trailing={badge(counts.support)} onPress={() => router.push('/apex/support')} />
        </SettingsGroup>

        <SettingsGroup title="Communication">
          <SettingsRow icon={glyph(BellRinging)} label="Push notifications" onPress={() => router.push('/apex/push')} />
          <SettingsRow icon={glyph(EnvelopeSimple)} label="Email campaigns" onPress={() => router.push('/apex/email')} />
          <SettingsRow icon={glyph(Megaphone)} label="WhatsApp blast" onPress={() => router.push('/apex/whatsapp/broadcast')} />
          <SettingsRow icon={glyph(ChartLineUp)} label="Stats recipients" onPress={() => router.push('/apex/stats-recipients')} />
        </SettingsGroup>

        <SettingsGroup title="Look up">
          <SettingsRow icon={glyph(Users)} label="Users" onPress={() => router.push('/apex/users')} />
          <SettingsRow icon={glyph(Buildings)} label="Spaces" onPress={() => router.push('/apex/spaces')} />
          <SettingsRow icon={glyph(CalendarBlank)} label="Events" onPress={() => router.push('/apex/events')} />
        </SettingsGroup>

        <SettingsGroup title="Platform config">
          <SettingsRow icon={glyph(ShieldCheck)} label="IAM" onPress={() => router.push('/apex/iam')} />
          <SettingsRow icon={glyph(Tag)} label="Categories" onPress={() => router.push('/apex/categories')} />
          <SettingsRow icon={glyph(ImageSquare)} label="Default images" onPress={() => router.push('/apex/default-images')} />
          <SettingsRow icon={glyph(DeviceMobile)} label="App version" onPress={() => router.push('/apex/app-version')} />
        </SettingsGroup>

        <SettingsGroup title="Platform">
          <SettingsRow icon={glyph(ChartBar)} label="Traffic" onPress={() => router.push('/apex/traffic')} />
          <SettingsRow
            icon={<Pulse size={ICON} color={sys?.color ?? tokens.accent} weight="fill" />}
            label="Status"
            value={sys?.text}
            onPress={() => router.push('/apex/status')}
          />
          <SettingsRow
            icon={glyph(Globe)}
            label="Open Apex on the web"
            external
            onPress={() => Linking.openURL(APEX_WEB_URL).catch(() => AppAlert.alert('Error', 'Unable to open Apex'))}
          />
        </SettingsGroup>
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
  error: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...font('medium') },
  stats: { marginTop: spacing[5], marginBottom: spacing[2], gap: spacing[3] },
});
